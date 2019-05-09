// Copyright (c) 2019 ExtraHash, The LightChain Developers
//
// Please see included LICENSE file for more information.

require('dotenv').config()
const WB = require('lightchain-wallet-backend');
const db = require('./utils').knex;
const readline = require('readline');

// start wallet
const daemon = new WB.ConventionalDaemon('xmlc.ml', '10002');
const [wallet, error] = WB.WalletBackend.openWalletFromFile(daemon, process.env.WALLET_NAME, process.env.WALLET_PASSWORD);
if (error) {
    console.log('Failed to open wallet: ' + error.toString());
}
console.log('Opened wallet');
wallet.start();
console.log('Started wallet ' + wallet.getPrimaryAddress());

// readling keypress handling
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
    // balance
    if (key.name === 'b') {
        const currentBalance = wallet.getBalance();
        console.log(`Current balance:\nUnlocked: ${humanReadable(currentBalance[0])}\nLocked: ${humanReadable(currentBalance[1])}`)
    }
    // sync status
    if (key.name === 's') {
        const syncStatus = wallet.getSyncStatus();
        console.log(`Wallet: ${syncStatus[0]} Local: ${syncStatus[1]} Network: ${syncStatus[2]}`);
    }
    // ctrl + c saves and quits
    if (key.ctrl && key.name === 'c') {
        wallet.saveWalletToFile(process.env.WALLET_NAME, process.env.WALLET_PASSWORD);
        process.exit();
    }
});

// on incoming transaction
wallet.on('incomingtx', async function(transaction) {
    const currentBalance = wallet.getBalance();
    console.log(`Incoming transaction of ${humanReadable(transaction.totalAmount())} received!`);
    console.log(`Current balance:\nUnlocked: ${humanReadable(currentBalance)}`)

    // if balance is enough, set up a round
    if (currentBalance[0] > 50000000000) {
        planPayment(wallet, db);
    }
});

// on synced
wallet.on('sync', (walletHeight, networkHeight) => {
    console.log(`Wallet synced! Wallet height: ${walletHeight}, Network height: ${networkHeight}`);
});

// on desynced
wallet.on('desync', (walletHeight, networkHeight) => {
    console.log(`Wallet is no longer synced! Wallet height: ${walletHeight}, Network height: ${networkHeight}`);
});

setInterval(planPayment.bind(null, wallet, db), 8.64e+7);

paymentDaemon(wallet, db);
setInterval(paymentDaemon.bind(null, wallet, db), 60000);


// plan the payment
async function planPayment(wallet, db) {

    console.log('Gathering information on payments...');
    const roundNonce = Date.now();
    const userList = await getUserList();
    let idArray = userList.map(item => [item.id, item.wallet]);

    idArray.forEach(async function(userInfo) {
        const [userID, userAddress] = userInfo
        const getShares = await db('shares')
            .select('percent')
            .from('shares')
            .where({
                id: userID
            })
            .limit(1);
        const payoutPercent = getShares[0].percent / 100;
        // const payoutAmount = payoutPercent * 47000000000;
        const payoutAmount = payoutPercent * 1000;
        if (payoutAmount !== 0) {
        await db('payments')
            .insert([{
                id: userID, 
                address: userAddress, 
                amount: payoutAmount, 
                nonce: roundNonce, 
                pending: true
            }])
        }
    })
    console.log('Wrote payment round to database.');
};

async function paymentDaemon(wallet, db) {
    const paymentQuery = await db('payments')
    .select('*')
    .from('payments')
    .where({pending: true});
    const paymentRound = paymentQuery.map(item => [item.id, item.nonce, item.address, item.amount])
    paymentRound.forEach(async function(data) {
        const [userID, roundNonce, userAddress, paymentAmount] = data;
        const [hash, err] = await wallet.sendTransactionBasic(userAddress, paymentAmount);
        if (err) {
            console.log(`${userID} ${userAddress} ${roundNonce} failed payment. Will retry next time payment daemon runs.`);
            console.log(err);
        } else {
            console.log(`${userID} ${userAddress} ${roundNonce} successful payment of ${humanReadable(paymentAmount)}, ${hash}, writing to db...`)
            await db('payments')
            .where({ id: userID, nonce: roundNonce})
            .update({pending: false, hash: hash})
            .limit(1);
        }
    })
}

// get * from users;
async function getUserList() {
    const userList = await db('users')
        .select('id', 'wallet')
        .from('users');
    return userList;
}

function humanReadable(amount) {
    return (amount / 100000000).toFixed(8);
}