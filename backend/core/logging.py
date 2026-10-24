"""
Structured logging configuration for Bria platform
"""
import logging
import json
import sys
from datetime import datetime
from typing import Any, Dict, Optional
from pythonjsonlogger import jsonlogger


class StructuredLogger:
    """Structured JSON logger"""
    
    def __init__(self, name: str, level: int = logging.INFO):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(level)
        self.logger.handlers.clear()
        
        # JSON formatter
        formatter = jsonlogger.JsonFormatter(
            '%(asctime)s %(name)s %(levelname)s %(message)s',
            json_ensure_ascii=False,
            timestamp=True
        )
        
        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)
    
    def _log(self, level: int, message: str, **kwargs):
        """Internal logging method with extra context"""
        # Avoid collisions with LogRecord built-in attributes (notably `name`).
        # Passing conflicting keys via `extra=` raises `KeyError`.
        reserved_keys = {"name", "message", "levelname", "asctime"}
        filtered_kwargs = {k: v for k, v in kwargs.items() if k not in reserved_keys}
        extra = {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'bria',
            **filtered_kwargs
        }
        self.logger.log(level, message, extra=extra)
    
    def info(self, message: str, **kwargs):
        """Log info message"""
        self._log(logging.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning message"""
        self._log(logging.WARNING, message, **kwargs)
    
    def error(self, message: str, exc_info: Optional[Exception] = None, **kwargs):
        """Log error message"""
        extra = {}
        if exc_info:
            extra.update({
                'error_type': type(exc_info).__name__,
                'error_message': str(exc_info),
            })
        extra.update(kwargs)
        # Ensure we don't collide with LogRecord built-in attributes.
        reserved_keys = {"name", "message", "levelname", "asctime"}
        for k in list(extra.keys()):
            if k in reserved_keys:
                extra.pop(k, None)
        # Pass exc_info separately to avoid conflict with extra dict
        if isinstance(exc_info, Exception):
            self.logger.exception(message, extra=extra)
        elif exc_info is True:
            import sys
            self.logger.error(message, exc_info=sys.exc_info(), extra=extra)
        else:
            self._log(logging.ERROR, message, **extra)
    
    def debug(self, message: str, **kwargs):
        """Log debug message"""
        self._log(logging.DEBUG, message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        """Log critical message"""
        self._log(logging.CRITICAL, message, **kwargs)


# Global logger instance
logger = StructuredLogger('bria', logging.INFO)


def get_logger(name: str) -> StructuredLogger:
    """Get a logger instance for a specific module"""
    return StructuredLogger(name)

