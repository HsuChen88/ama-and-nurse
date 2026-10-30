from dataclasses import dataclass


@dataclass(slots=True)
class ApiError(Exception):
    code: str
    message: str
    status_code: int


class ProviderError(Exception):
    """Raised when a provider cannot complete its operation."""
