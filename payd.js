// Copyright (c) 2019 ExtraHash, The LightChain Developers
//
// Please see included LICENSE file for more information.

require('dotenv').config()
const WB = require('lightchain-wallet-backend');
const db = require('./utils').knex;
const readline = require('readline');

main();

async function main() {
    openWallet()
        .catch(err => {
            console.log('Caught promise rejection: ' + err);
        })
}

async function openWallet() {

    // start wallet
    const daemon = new WB.ConventionalDaemon('xmlc.ml', '10002');
    const [wallet, error] = WB.WalletBackend.openWalletFromFile(daemon, process.env.WALLET_NAME, process.env.WALLET_PASSWORD);
    if (error) {
        console.log('Failed to open wallet: ' + error.toString());
    }
    console.log('Opened wallet');
    await wallet.start();
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
    wallet.on('incomingtx', async function (transaction) {
        const currentBalance = wallet.getBalance();
        console.log(`Incoming transaction of ${humanReadable(transaction.totalAmount())} received!`);
        console.log(`Current balance:\nUnlocked: ${humanReadable(currentBalance)}`)

        // if balance is enough, pay out
        if (currentBalance[0] > 50000010000) {
            console.log('DEV TRANSACTION: Attempting to send dev 5.00...')
            const [hash, err] = await wallet.sendTransactionBasic(proccess.env.DEV_WALLET, 500000000)
            while (true) {
                if (err) {
                    console.log(`DEV TRANSACTION: Failed to send transaction for dev 5.00 : ` + err.toString());
                    await sleep(5000);
                    console.log(`DEV TRANSACTION: Retrying for dev 5.00...`);
                    await wallet.sendTransactionBasic(proccess.env.DEV_WALLET, 500000000);
                    continue;
                }
                break;
            }
            makePayment(wallet, db);
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

    // uncomment to test function
    // makePayment(wallet, db);
}

// split up and make payment
async function makePayment(wallet, db) {
    const userList = await getUserList();

    console.log('Starting payments...');

    let idArray = userList.map( item => [item.id, item.wallet] );

    idArray.forEach(async function(userInfo) {
        wallet.sendTransactionBasic();
        const [userID, userAddress] = userInfo;
        const getShares = await db('shares')
            .select('percent')
            .from('shares')
            .where({
                id: userID
            })
            .limit(1);
        const payoutPercent = getShares[0].percent;
        const payoutAmount = payoutPercent * 49500010000;
        if (payoutAmount !== 0) {
            console.log(`ID#${userID} Attempting to send ${humanReadable(payoutAmount)} to ${userAddress}`);
            const [hash, err] = await wallet.sendTransactionBasic(userAddress, payoutAmount);
            while (true) {
                if (err) {
                    console.log(`ID#${userID} Failed to send transaction for ${userAddress} ${payoutAmount} : ` + err.toString());
                    await sleep(5000);
                    console.log(`ID#${userID} Retrying for ${userAddress} ${payoutAmount}...`);
                    await wallet.sendTransactionBasic(userAddress, payoutAmount);
                    continue;
                }
                break;
            }
            console.log(`ID#${userID} Payment succeeded to ${userAddress} ${humanReadable(payoutAmount)} ${hash}`);
            await db('payments')
            .insert({
                id: userID,
                hash: hash,
                amount: humanReadable(payoutAmount),
            })
        }
    })

    };

// get * from users;
async function getUserList() {
    const userList = await db('users')
        .select('id', 'wallet')
        .from('users');
    return userList;
}

// get * from shares;
async function getShares() {
    const shareList = await db('shares')
        .select('*')
        .from('shares');
    return shareList;
}

function humanReadable(amount) {
    return (amount/100000000).toFixed(8);
}
