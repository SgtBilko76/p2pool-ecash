# P2Pool for eCash (XEC)

A fork of [jtoomim/p2pool](https://github.com/jtoomim/p2pool) that mines eCash on its own,
new share chain (`--net ecash`). Miners connect with Bitcoin Stratum v1 (any SHA-256 ASIC).
The original upstream README is in `README-upstream.md`.

## What is eCash-specific

Every block template from Bitcoin ABC requires extra coinbase outputs, which the pool pays
**before** the PPLNS split (see `get_ecash_work` in `p2pool/bitcoin/helper.py`):

| Output | Amount | Rule | How p2pool checks peer shares |
|---|---|---|---|
| Miner fund `ecash:prfhcnyqnl5cgrnmlfmms675w93ld7mvvqd0y8lz07` | 32% of coinbase value | consensus | rejected if missing or underpaid |
| Staking reward (winner from Avalanche) | 10% of coinbase value | parking policy | *naughty* (punished, not built on) if it pays nobody on our node's `getstakingreward` list for the same previous block |
| Real-time targeting (RTT) | block hash below `rtt.nexttarget` | parking policy | warning in the log when a found block misses it |

Share type `ECashShare` (version 36) stores these outputs in the share, so every node can
rebuild and verify the coinbase. It is the only share type accepted on `--net ecash`.

Miners receive the remaining ~58% of each block (subsidy plus fees) by PPLNS, as on BCH p2pool.

## Node requirements (Bitcoin ABC)

In the node's `bitcoin.conf`:

```
server=1
rpcuser=...
rpcpassword=...
# ZMQ is not needed; p2pool uses RPC plus the node's P2P port (8333) for block relay.
```

Do **not** set `-simplegbt` (p2pool reads the full `coinbasetxn` format) or
`-avalanchestakingrewards=0`, and leave Avalanche enabled (the default).

## Running (PyPy 2.7)

```
curl -sSfL https://downloads.python.org/pypy/pypy2.7-v7.3.20-linux64.tar.bz2 | tar xj
PY=$PWD/pypy2.7-v7.3.20-linux64/bin/pypy
$PY -m ensurepip && $PY -m pip install 'pip<21' 'setuptools<45' wheel typing 'incremental==17.5.0'
$PY -m pip install -r requirements-pypy2.txt

$PY run_p2pool.py --net ecash \
    --bitcoind-address 127.0.0.1 --bitcoind-rpc-port 8332 --bitcoind-p2p-port 8333 \
    -a ecash:qYOUR_PAYOUT_ADDRESS \
    RPCUSER RPCPASSWORD
```

Omit `RPCUSER RPCPASSWORD` to read them from `~/.bitcoin/bitcoin.conf`
(`--bitcoind-config-path` for another location). Then point ASICs at
`stratum+tcp://SERVER:9351` with an `ecash:` address as the worker name. The web dashboard is on
`http://SERVER:9351/` (static files in `web-static/`, served from `/static/`). Open port 9350 so other p2pool nodes can connect.

## HTTPS for the web dashboard

Port 9351 serves both stratum and the dashboard over plain HTTP; ASIC miners
don't speak TLS, so leave 9351 as it is and put nginx with a Let's Encrypt
certificate in front of the dashboard:

```
server {
    listen 80;
    server_name pool.example.com;
    location / {
        proxy_pass http://127.0.0.1:9351;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then `sudo certbot --nginx -d pool.example.com` adds the certificate and the
redirect to HTTPS. The dashboard shows the stratum port (9351) from the node, so
the connection details stay correct behind the proxy.

## Starting a new share chain

`PERSIST = False` in `p2pool/networks/ecash.py` lets the first node mine without peers. Once
several public nodes exist, set `PERSIST = True` and add them to `BOOTSTRAP_ADDRS`; other nodes
join with `-n HOST:9350`.

With a small pool, blocks are rare: at a share of `h` of the eCash network hashrate, the pool
finds a block every `10 min / h` on average (1% of the network: about one block per 17 hours).

## Tests

```
$PY -m twisted.trial p2pool.test.test_ecash
```

Some upstream tests (`test_node`, `test_p2p`, expiring_dict, a few BCH address tests) already
fail on upstream `master` and are unchanged by this fork.

## Known limitations

- The web dashboard (`/static/`) shows XEC correctly. The old pages (`classic.html`, `graphs.html`)
  still use the upstream `1e-8` scaling, so their XEC values appear 1,000,000 times too small.
- Python 2.7 is end-of-life; a Python 3 port is planned.
