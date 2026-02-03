"""
Setup script for Bria backend package
"""
from setuptools import setup, find_packages

setup(
    name="bria-platform",
    version="2.0.0",
    description="Enterprise renewable energy forecasting platform",
    packages=find_packages(),
    python_requires=">=3.11",
    install_requires=[
        "fastapi>=0.104.1",
        "uvicorn[standard]>=0.24.0",
        "pydantic>=2.5.0",
        "pydantic-settings>=2.1.0",
        "asyncpg>=0.29.0",
        "redis[hiredis]>=5.0.1",
        "python-jose[cryptography]>=3.3.0",
        "passlib[bcrypt]>=1.7.4",
        "python-multipart>=0.0.6",
        "python-json-logger>=2.0.7",
        "prometheus-client>=0.19.0",
        "aiomqtt>=2.0.0",
        "confluent-kafka>=2.3.0",
        "numpy>=1.26.2",
        "pandas>=2.1.3",
        "pvlib>=0.10.3",
        "xgboost>=2.0.3",
        "scikit-learn>=1.3.2",
        "scipy>=1.11.4",
        "joblib>=1.3.2",
    ],
)

