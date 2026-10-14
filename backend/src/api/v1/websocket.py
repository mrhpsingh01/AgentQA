"""
AgentQA WebSocket Hub
Enables real-time bi-directional streaming of live test execution and self-healing notifications.
"""

import asyncio
import json
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import structlog

logger = structlog.get_logger()
router = APIRouter()


class WebSocketHub:
    def __init__(self):
        self.active_rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_rooms:
            self.active_rooms[room_id] = set()
        self.active_rooms[room_id].add(websocket)
        logger.debug("WebSocket client connected", room_id=room_id)

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_rooms:
            self.active_rooms[room_id].discard(websocket)
            if not self.active_rooms[room_id]:
                del self.active_rooms[room_id]
        logger.debug("WebSocket client disconnected", room_id=room_id)

    async def broadcast_to_room(self, room_id: str, message: dict):
        if room_id in self.active_rooms:
            dead_sockets = set()
            payload = json.dumps(message)
            for ws in self.active_rooms[room_id]:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead_sockets.add(ws)
            for dead in dead_sockets:
                self.disconnect(room_id, dead)


ws_hub = WebSocketHub()


@router.websocket("/ws/runs/{run_id}")
async def websocket_run_stream(websocket: WebSocket, run_id: str):
    await ws_hub.connect(run_id, websocket)
    try:
        # Send initial connection confirmation
        await websocket.send_text(json.dumps({
            "type": "CONNECTED",
            "run_id": run_id,
            "message": "Subscribed to live run stream"
        }))
        while True:
            # Keep connection open, handle client ping/messages
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        ws_hub.disconnect(run_id, websocket)
