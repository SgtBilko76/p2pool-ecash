# Dockerfile for P2Pool eCash (untested: built from the steps verified on a bare Linux host)

FROM debian:bookworm-slim

ARG PYPY=pypy2.7-v7.3.20-linux64

RUN apt-get update \
  && apt-get -y --no-install-recommends install ca-certificates curl bzip2 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && curl -sSfL https://downloads.python.org/pypy/$PYPY.tar.bz2 | tar xj -C /opt \
  && ln -s /opt/$PYPY/bin/pypy /usr/local/bin/pypy \
  && pypy -m ensurepip \
  && pypy -m pip install --no-cache-dir 'pip<21' 'setuptools<45' wheel typing 'incremental==17.5.0'

WORKDIR /p2pool
COPY requirements-pypy2.txt .
RUN pypy -m pip install --no-cache-dir -r requirements-pypy2.txt
COPY . .

# 9350: p2pool share chain (must be reachable from other p2pool nodes), 9351: miners (stratum) and web UI
EXPOSE 9350 9351
ENTRYPOINT ["pypy", "run_p2pool.py", "--net", "ecash"]
