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

wallet.scanCoinbaseTransactions(true);

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
    console.log(`Incoming transaction of ${transaction.totalAmount()} received!`);
        await db('wallet') 
        .insert([{
            timestamp: Date.now(),
            nonce: getRoundNonce(Date.now()),
            amount: transaction.totalAmount()
        }]) 
});

// on synced
wallet.on('sync', (walletHeight, networkHeight) => {
    console.log(`Wallet synced! Wallet height: ${walletHeight}, Network height: ${networkHeight}`);
});

// on desynced
wallet.on('desync', (walletHeight, networkHeight) => {
    console.log(`Wallet is no longer synced! Wallet height: ${walletHeight}, Network height: ${networkHeight}`);
});

// uncomment to test

setInterval(paymentDaemon.bind(null, wallet, db), 30000);
queryRound(wallet, db);

function queryRound(wallet, db) {
    let currentRound = getRoundNonce(Date.now());
    console.log('Current round nonce = ' + currentRound);
    setInterval(function() {
        let checkRound = getRoundNonce(Date.now());
        if (checkRound  !== currentRound) {
            planPayment(wallet, db, currentRound);
            console.log(`Detected new round ${checkRound}`);
            currentRound = checkRound;
        }
    }, 5000);
};

// plan the payment
async function planPayment(wallet, db, roundNonce) {
    const checkUnique = await db('payments')
        .select('*')
        .from('payments')
        .where({
            nonce: roundNonce
        })
    const walletInfo = await db('wallet')
        .select('*')
        .from('wallet')
        .where({
            nonce: roundNonce
        })
        .map(a => a.amount);
    const pendingBalance = walletInfo.reduce(add, 0)
    const [unlockedBalance, lockedBalance] = wallet.getBalance();
    if (!checkUnique.length) {
        console.log('Gathering information on payments...');
        const devFee = pendingBalance * .0619;
        const paymentAmount = (pendingBalance - devFee);
        if (devFee) {
            await db('payments')  // sending the dev fee
            .insert([{
                id: 3,
                address: 'XwnBtwRpGiu99QpQ3A3EG62YLugbaq4VQ1dP4SincSPF128ipiVUTVw6224UwcUabL8rw2dfUtBZk2q9H2A4W5No18yFJDpeB',
                amount: devFee,
                nonce: roundNonce,
                pending: true,
                devfee: true
            }])
        }
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
            const payoutPercent = getShares[0].percent / 1000000;
            const payoutAmount = payoutPercent * paymentAmount; 
            if (payoutAmount) {   
            await db('payments')
                .insert([{
                    id: userID, 
                    address: userAddress, 
                    amount: payoutAmount, 
                    nonce: roundNonce, 
                    pending: true,
                    devfee: false,
                    percent: getShares[0].percent
                }])
            }
        })
        console.log('Wrote payment round to database.');
    }
};

// make any due payments
async function paymentDaemon(wallet, db) {
    console.log('** firing up payment engine...')
    const paymentQuery = await db('payments')
    .select('*')
    .from('payments')
    .where({pending: true});
    if (!paymentQuery.length) {
        console.log('** no payments pending. stopping payment en]gine');
        return;
    }
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

// convert unix timestamp into hourly round nonce
function getRoundNonce(timestamp) {
  let d = new Date(parseInt(timestamp)) // Convert the passed timestamp to milliseconds
  let yyyy = d.getFullYear()
  let mm = ('0' + (d.getMonth() + 1)).slice(-2) // Months are zero based. Add leading 0.
  let dd = ('0' + d.getDate()).slice(-2) // Add leading 0.
  let hh = ('0' + d.getHours()).slice(-2) // Add leading 0
  let roundNonce;
  // ie: 2013032416
  roundNonce = yyyy + mm + dd + hh;
  return roundNonce;
};

function humanReadable(amount) {
    return (amount / 100000000).toFixed(8);
}

function add(accumulator, a) {
    return accumulator + a;
}
