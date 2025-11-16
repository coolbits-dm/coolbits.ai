from fastapi import APIRouter, Request, Response, status
import json, logging

router = APIRouter()


@router.post("/api/v1/task-hook")
async def task_hook(request: Request) -> Response:
    try:
        body = await request.body()
        payload = json.loads(body.decode("utf-8") or "{}")
        logging.info("TASK PAYLOAD %s", payload)
    except Exception:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)
    # răspunde rapid 2xx; munca grea se face async altundeva
    return Response(status_code=status.HTTP_204_NO_CONTENT)

