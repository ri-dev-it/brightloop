.PHONY: setup run test billing bulk docker-up docker-down clean
PY := .venv/bin/python

setup:        ## create venv and install dependencies
	python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
run:          ## start dev server on :5000
	$(PY) run.py
test:         ## run the test-suite
	$(PY) -m unittest discover -s tests -v
billing:      ## run the daily billing job
	$(PY) run.py billing
bulk:         ## load 5,000 subscriptions for a performance check
	$(PY) run.py bulk 5000
docker-up:    ## build and start in Docker on :8000
	docker compose up --build -d
docker-down:
	docker compose down
clean:        ## remove local database and caches
	rm -rf data/*.db* data/outbox.log .venv; find . -name __pycache__ -prune -exec rm -rf {} +
