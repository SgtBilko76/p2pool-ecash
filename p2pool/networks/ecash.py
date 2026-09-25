from p2pool.bitcoin import networks

# CHAIN_LENGTH = number of shares back client keeps
# REAL_CHAIN_LENGTH = maximum number of shares back client uses to compute payout
# REAL_CHAIN_LENGTH must always be <= CHAIN_LENGTH
# REAL_CHAIN_LENGTH must be changed in sync with all other clients
# changes can be done by changing one, then the other

PARENT = networks.nets['ecash']
SHARE_PERIOD = 60 # seconds -- one minute
CHAIN_LENGTH = 3*24*60 # shares -- three days
REAL_CHAIN_LENGTH = 3*24*60 # shares -- three days
TARGET_LOOKBEHIND = 200 # shares
SPREAD = 3 # blocks
IDENTIFIER = 'b75c9c1b0941deda'.decode('hex')
PREFIX = 'add2649b2f48ac07'.decode('hex')
P2P_PORT = 9350
MIN_TARGET = 0
MAX_TARGET = 2**256//2**32 - 1
PERSIST = False # New chain: the first node must be able to mine without peers. Set to True once several public nodes exist.
WORKER_PORT = 9351
BOOTSTRAP_ADDRS = [
        ]
ANNOUNCE_CHANNEL = '#p2pool-ecash'
VERSION_CHECK = lambda v: None # Bitcoin ABC support is checked in RPC_CHECK and by the getblocktemplate fields in helper.getwork
VERSION_WARNING = lambda v: None
SOFTFORKS_REQUIRED = set()
MINIMUM_PROTOCOL_VERSION = 3600
BLOCK_MAX_SIZE = 32000000
BLOCK_MAX_WEIGHT = 128000000
GENESIS_SHARE_VERSION = 36 # data.ECashShare; this chain accepts no other share type
