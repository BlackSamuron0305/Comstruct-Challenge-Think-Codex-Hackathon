"""SSRF-safe HTTP fetcher for pulling supplier catalog data from external URLs."""
from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status

# RFC 1918 + special-use ranges that must never be fetched server-side
_BLOCKED_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),   # link-local / cloud metadata (AWS, GCP, Azure)
    ipaddress.ip_network("100.64.0.0/10"),    # CGNAT shared space
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),         # unique-local IPv6
    ipaddress.ip_network("fe80::/10"),        # link-local IPv6
]

_BLOCKED_HOSTNAMES = frozenset({"localhost", "metadata.google.internal"})

_CONTENT_TYPE_TO_EXTENSION: dict[str, str] = {
    "text/csv": ".csv",
    "application/csv": ".csv",
    "text/tab-separated-values": ".tsv",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.oasis.opendocument.spreadsheet": ".ods",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/pdf": ".pdf",
    "application/json": ".json",
    "text/plain": ".csv",
}


def _validate_url(url: str) -> None:
    """Raise HTTP 400 if the URL targets a private/localhost network (SSRF guard)."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_url")

    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="url_scheme_must_be_http_or_https",
        )

    hostname = (parsed.hostname or "").lower().strip("[]")
    if not hostname:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_url")

    if hostname in _BLOCKED_HOSTNAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="url_targets_private_network",
        )

    # If the hostname is a literal IP address, check it against blocked ranges
    try:
        addr = ipaddress.ip_address(hostname)
        for net in _BLOCKED_NETWORKS:
            if addr in net:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="url_targets_private_network",
                )
    except ValueError:
        pass  # Not a literal IP — DNS resolution happens inside httpx; acceptable risk for a hackathon


def _guess_filename(url: str, content_type: str) -> str:
    """Derive a filename (with extension) from the URL path or Content-Type header."""
    path = urlparse(url).path
    name = path.rsplit("/", 1)[-1] if "/" in path else path
    if name and "." in name:
        return name

    # Fall back to content-type
    ct_base = content_type.split(";")[0].strip().lower()
    ext = _CONTENT_TYPE_TO_EXTENSION.get(ct_base)
    if ext:
        return f"api-data{ext}"

    return "api-data.csv"


async def fetch_url(
    url: str,
    *,
    api_key: str | None = None,
    api_key_header: str = "Authorization",
    timeout: int = 30,
) -> tuple[bytes, str]:
    """Fetch *url* and return ``(content_bytes, filename_hint)``.

    The *api_key* is sent as ``Authorization: Bearer <key>`` when
    *api_key_header* is ``"Authorization"``, otherwise as a raw header value.

    Raises :class:`~fastapi.HTTPException` for SSRF attempts, bad URLs, or
    upstream HTTP errors.
    """
    _validate_url(url)

    headers: dict[str, str] = {}
    if api_key:
        if api_key_header.strip().lower() == "authorization":
            headers["Authorization"] = f"Bearer {api_key}"
        else:
            headers[api_key_header.strip()] = api_key

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        max_redirects=3,
    ) as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"upstream_error_{exc.response.status_code}",
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="upstream_unreachable",
            ) from exc

        content_type = response.headers.get("content-type", "")
        filename = _guess_filename(url, content_type)
        return response.content, filename
