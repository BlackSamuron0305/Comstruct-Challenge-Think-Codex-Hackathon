from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import products as products_router
from .routers import suppliers as suppliers_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(title="comstruct catalog-service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # gateway is the public surface; this is internal-only
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products_router.router)
app.include_router(products_router.internal_router)
app.include_router(products_router.categories_router)
app.include_router(suppliers_router.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "catalog-service"}
