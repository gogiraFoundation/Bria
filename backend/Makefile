POETRY ?= poetry

.PHONY: install test lint format typecheck coverage

install:
	$(POETRY) install

test:
	$(POETRY) run pytest

lint:
	$(POETRY) run flake8

format:
	$(POETRY) run black .

typecheck:
	$(POETRY) run mypy .

coverage:
	$(POETRY) run pytest --cov=. --cov-report=term-missing

