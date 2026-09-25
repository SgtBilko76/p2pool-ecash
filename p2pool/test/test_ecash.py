import unittest

from p2pool import data, networks, p2p
from p2pool.bitcoin import data as bitcoin_data, helper

ecash_net = networks.nets['ecash']

class TestNet(object):
    '''The eCash share chain with a trivial share target, so shares need no mining.'''
    def __getattr__(self, name):
        return getattr(ecash_net, name)
    MAX_TARGET = 2**256 - 1

SUBSIDY = 312500000 + 12345 # 3,125,000 XEC block subsidy plus fees, in sats
MINER_FUND_SCRIPT = list(ecash_net.PARENT.MINER_FUND_SCRIPTS)[0]
STAKER_SCRIPT = ('76a914' + '11'*20 + '88ac').decode('hex')
MINER_ADDRESS = bitcoin_data.pubkey_hash_to_address(0x00ab*2**144 + 0x1234, -1, 0, ecash_net.PARENT)

def make_share(reserved_outputs):
    net = TestNet()
    tracker = data.OkayTracker(net)
    share_info, gentx, other_tx_hashes, get_share = data.ECashShare.generate_transaction(
        tracker=tracker,
        share_data=dict(
            previous_share_hash=None,
            coinbase='\x03\x40\x42\x0f' + 'p2pool-ecash',
            nonce=0,
            address=MINER_ADDRESS,
            subsidy=SUBSIDY,
            donation=0,
            stale_info=None,
            desired_version=data.ECashShare.VOTING_VERSION,
            reserved_outputs=reserved_outputs,
        ),
        block_target=2**220,
        desired_timestamp=1700000000,
        desired_target=2**256 - 1,
        ref_merkle_link=dict(branch=[], index=0),
        desired_other_transaction_hashes_and_fees=[],
        net=net,
        known_txs={},
        base_subsidy=312500000,
    )
    header = dict(
        version=0x20000000,
        previous_block=0x1234,
        merkle_root=bitcoin_data.check_merkle_link(bitcoin_data.hash256(bitcoin_data.tx_id_type.pack(gentx)), dict(branch=[], index=0)),
        timestamp=1700000000,
        bits=bitcoin_data.FloatingInteger.from_target_upper_bound(2**220),
        nonce=0,
    )
    share = get_share(header)
    # what a peer sees: the share serialized and parsed again
    received = data.load_share(share.as_share(), net, None)
    return gentx, received, tracker

GOOD_OUTPUTS = [
    dict(value=SUBSIDY*32//100, script=MINER_FUND_SCRIPT),
    dict(value=SUBSIDY*10//100, script=STAKER_SCRIPT),
]

class Test(unittest.TestCase):
    def tearDown(self):
        helper.staking_winners.clear()

    def test_coinbase_pays_reserved_outputs_first(self):
        gentx, share, tracker = make_share(GOOD_OUTPUTS)
        outs = gentx['tx_outs']
        self.assertEqual([(o['value'], o['script']) for o in outs[:2]], [(o['value'], o['script']) for o in GOOD_OUTPUTS])
        self.assertEqual(outs[-1]['value'], 0) # p2pool ref hash commitment stays last
        self.assertEqual(sum(o['value'] for o in outs), SUBSIDY)
        miner = bitcoin_data.address_to_script2(MINER_ADDRESS, ecash_net.PARENT)
        self.assertTrue(any(o['script'] == miner and o['value'] > 0 for o in outs[2:-1]))

    def test_peer_accepts_valid_share(self):
        gentx, share, tracker = make_share(GOOD_OUTPUTS)
        self.assertEqual(share.check(tracker), gentx)
        self.assertFalse(share.naughty)

    def test_peer_rejects_missing_miner_fund(self):
        gentx, share, tracker = make_share(GOOD_OUTPUTS[1:])
        self.assertRaises(ValueError, share.check, tracker)

    def test_peer_rejects_underpaid_miner_fund(self):
        gentx, share, tracker = make_share([dict(GOOD_OUTPUTS[0], value=SUBSIDY*32//100 - 1)] + GOOD_OUTPUTS[1:])
        self.assertRaises(ValueError, share.check, tracker)

    def test_staking_winner_known_to_our_node(self):
        helper.staking_winners[0x1234] = frozenset(['\x51', STAKER_SCRIPT]) # any listed winner is acceptable
        gentx, share, tracker = make_share(GOOD_OUTPUTS)
        share.check(tracker)
        self.assertFalse(share.naughty)

    def test_staking_winner_unknown_to_our_node_is_naughty(self):
        helper.staking_winners[0x1234] = frozenset(['\x51'])
        gentx, share, tracker = make_share(GOOD_OUTPUTS)
        share.check(tracker)
        self.assertEqual(share.naughty, 1)

    def test_staking_reward_not_judged_on_other_blocks(self):
        helper.staking_winners[0x9999] = frozenset(['\x51'])
        gentx, share, tracker = make_share(GOOD_OUTPUTS)
        share.check(tracker)
        self.assertFalse(share.naughty)

    def test_share_types_are_network_specific(self):
        gentx, share, tracker = make_share(GOOD_OUTPUTS)
        self.assertRaises(p2p.PeerMisbehavingError, data.load_share, share.as_share(), networks.nets['bitcoincash'], None)
        self.assertRaises(p2p.PeerMisbehavingError, data.load_share, dict(type=35, contents=''), ecash_net, None)

    def test_reserved_outputs_cannot_exceed_subsidy(self):
        self.assertRaises(ValueError, make_share, [dict(value=SUBSIDY + 1, script=MINER_FUND_SCRIPT)])

class TestGetblocktemplate(unittest.TestCase):
    # shape of Bitcoin ABC getblocktemplate output, src/rpc/mining.cpp
    work = dict(
        coinbasevalue=SUBSIDY,
        coinbasetxn=dict(
            minerfund=dict(addresses=['ecash:prfhcnyqnl5cgrnmlfmms675w93ld7mvvqd0y8lz07'], minimumvalue=SUBSIDY*32//100),
            stakingrewards=dict(payoutscript=dict(hex=STAKER_SCRIPT.encode('hex'), asm='', type='pubkeyhash'), minimumvalue=SUBSIDY*10//100),
        ),
        rtt=dict(nexttarget='1d00ffff'),
    )

    def test_parse(self):
        r = helper.get_ecash_work(self.work, ecash_net)
        self.assertEqual(r['reserved_outputs'], GOOD_OUTPUTS)
        self.assertEqual(r['payout_subsidy'], SUBSIDY - SUBSIDY*32//100 - SUBSIDY*10//100)
        self.assertEqual(r['rtt_target'], 0xffff * 2**208)

    def test_unknown_miner_fund_address(self):
        work = dict(self.work, coinbasetxn=dict(minerfund=dict(addresses=[MINER_ADDRESS], minimumvalue=1)))
        self.assertRaises(ValueError, helper.get_ecash_work, work, ecash_net)

    def test_not_an_ecash_node(self):
        self.assertRaises(ValueError, helper.get_ecash_work, dict(coinbasevalue=SUBSIDY), ecash_net)
