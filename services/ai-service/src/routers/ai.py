from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..dependencies import require_internal_secret
from ..services.classification import classify
from ..services.column_mapping import map_columns
from ..services.recommendation import recommend_for_task

router = APIRouter(prefix="/ai", tags=["ai"])


class ColumnsRequest(BaseModel):
    columns: list[dict]


@router.post("/map-columns", dependencies=[Depends(require_internal_secret)])
async def map_columns_endpoint(body: ColumnsRequest):
    return await map_columns(body.columns)


class ClassifyRequest(BaseModel):
    items: list[dict]


@router.post("/classify", dependencies=[Depends(require_internal_secret)])
async def classify_endpoint(body: ClassifyRequest):
    return await classify(body.items)


class RecommendRequest(BaseModel):
    task: str
    project: str | None = None
    trade: str | None = None
    cart: list[dict] | None = None
    limit: int = 12


@router.post("/recommend", dependencies=[Depends(require_internal_secret)])
async def recommend_endpoint(body: RecommendRequest):
    return await recommend_for_task(
        body.task, project=body.project, trade=body.trade, cart=body.cart, limit=body.limit,
    )
