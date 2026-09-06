import os
from fastapi import Header, HTTPException

# One shared password for the whole tool (no per-user accounts, no per-mode
# passwords - Stories and Video share the same gate).
# Set this as an environment variable wherever you deploy:
#   export APP_PASSWORD="whatever-you-want"
APP_PASSWORD = os.environ.get("APP_PASSWORD", "changeme")


def require_password(x_app_password: str = Header(default="")):
    if x_app_password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="Wrong password")
