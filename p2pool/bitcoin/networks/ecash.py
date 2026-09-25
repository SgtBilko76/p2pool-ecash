import os
import platform

from twisted.internet import defer

from .. import data, helper
from p2pool.util import pack


P2P_PREFIX = 'e3e1f3e8'.decode('hex') # net magic
P2P_PORT = 8333
ADDRESS_VERSION = 0
ADDRESS_P2SH_VERSION = 5
HUMAN_READABLE_PART = 'ecash'
RPC_PORT = 8332
RPC_CHECK = defer.inlineCallbacks(lambda bitcoind: defer.returnValue(
            (yield helper.check_block_header(bitcoind, '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f')) and # genesis block
            (yield helper.check_block_header(bitcoind, '000000000000000000651ef99cb9fcbe0dadde1d424bd9f15ff20136191a5eec')) and # 478559 -- Bitcoin Cash fork
            (yield bitcoind.rpc_getblockchaininfo())['chain'] == 'main' and
            'Bitcoin ABC' in (yield bitcoind.rpc_getnetworkinfo())['subversion'] # eCash nodes run Bitcoin ABC
        ))
SUBSIDY_FUNC = lambda height: 50*100000000 >> (height + 1)//210000
POW_FUNC = data.hash256
BLOCK_PERIOD = 600 # s
SYMBOL = 'XEC'
SATS_PER_COIN = 100 # 1 XEC = 100 sats
CONF_FILE_FUNC = lambda: os.path.join(os.path.join(os.environ['APPDATA'], 'Bitcoin') if platform.system() == 'Windows' else os.path.expanduser('~/Library/Application Support/Bitcoin/') if platform.system() == 'Darwin' else os.path.expanduser('~/.bitcoin'), 'bitcoin.conf')
BLOCK_EXPLORER_URL_PREFIX = 'https://explorer.e.cash/block/'
ADDRESS_EXPLORER_URL_PREFIX = 'https://explorer.e.cash/address/'
TX_EXPLORER_URL_PREFIX = 'https://explorer.e.cash/tx/'
SANE_TARGET_RANGE = (2**256//2**32//100000000 - 1, 2**256//2**32 - 1)
DUMB_SCRYPT_DIFF = 1
DUST_THRESHOLD = 0.001e8

# eCash coinbase rules (Bitcoin ABC src/minerfund.cpp, src/policy/block/stakingrewards.cpp).
# The miner fund is consensus; the staking reward and RTT are Avalanche parking
# policies, so a block that breaks them gets parked and in practice orphaned.
ECASH_RULES = True
CASHADDR = True
MINER_FUND_RATIO = 32 # percent of coinbase value
MINER_FUND_SCRIPTS = set([
    'a914d37c4c809fe9840e7bfa77b86bd47163f6fb6c6087'.decode('hex'), # ecash:prfhcnyqnl5cgrnmlfmms675w93ld7mvvqd0y8lz07
])
STAKING_REWARD_RATIO = 10 # percent of coinbase value
padding_bugfix = True # always zero-pad hash160s in cashaddrs; set before the first share is loaded, unlike BCH
