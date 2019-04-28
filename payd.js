// Copyright (c) 2019 ExtraHash, The LightChain Developers
//
// Please see included LICENSE file for more information.

require('dotenv').config()
const WB = require('turtlecoin-wallet-backend');
const db = require('./utils').knex;

main();

async function main() {
    openWallet().catch(err => {
        console.log('Caught promise rejection: ' + err);
    });

    const userList = await db('users')
    .select('*')
    .from('users')

    const pingList = await db('pings')
    .select('*')
    .from('pings')

    let lookupArray = userList.map(item => item.id);
    console.log(lookupArray);

}

async function openWallet() {
    const daemon = new WB.BlockchainCacheApi('blockapi.aeonclassic.org', true);
    const [wallet, error] = WB.WalletBackend.openWalletFromFile(daemon, 'senseitest.wallet', process.env.WALLET_PASSWORD);
    if (error) {
        console.log('Failed to open wallet: ' + error.toString());
    }
    console.log('Opened wallet');
    await wallet.start();
    console.log('Started wallet ' + wallet.getPrimaryAddress());
    /* After some time...
    wallet.stop();
    */
}