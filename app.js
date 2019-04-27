// Copyright (c) 2019 ExtraHash, The LightChain Developers
//
// Please see included LICENSE file for more information.

require('dotenv').config()
const db = require('./utils').knex;
const request = require('request-promise');

main();

function main() {
    nodeCheck();
    setInterval(nodeCheck, 600000);
    checkShares();
    setInterval(checkShares, 600000);
}

async function nodeCheck() {
    console.log('** getting nodes from db...')
    const nodesFromDB = await db('nodes')
    .select('ip', 'id')
    .from('nodes');
    let nodeArray = nodesFromDB.map(a => a.ip);
    let insertArray = nodesFromDB;
    const validateResults = await validateNodes(nodeArray);
    for (let i = validateResults.length - 1; i >= 0; i--) {
        if (validateResults[i] === undefined || validateResults[i].amount !== 0) {
            nodeArray.splice(i, 1);
            insertArray.splice(i, 1);
        }
    }
    const currentHeight = await getData('http://blockapi.aeonclassic.org/block/header/top');
    const checkHeight = getRandomNumber(currentHeight.height);
    const checkCacheHeight = checkHeight - 1;
    const cacheHash = await getData(`https://blockapi.aeonclassic.org/block/header/${checkCacheHeight}`);
    const compareHashResults = await compareHash(nodeArray, checkHeight);
    for (let i = compareHashResults.length - 1; i >= 0; i--) {
        if (compareHashResults[i].result !== cacheHash.hash) {
            nodeArray.splice(i, 1);
            insertArray.splice(i, 1);
        }
    }
    console.log(`** passed health checks\n${nodeArray}\n** writing to db...`);
    await db('pings')
        .insert(insertArray);
}

async function checkShares() {
    const pingList = [];
    const users = await db('users')
    .select('*')
    .from('users')
    let lookupArray = users.map(item => `${item.id}`);
    lookupArray.forEach(function(element) {
        getPingList(element, pingList, users);
    });
}

async function getPingList(userID, pingList, users) {
    // SELECT * FROM pings WHERE timestamp >= current_timestamp() - INTERVAL 1 DAY;
    const pingRequest = await db('pings')
    .select('*')
    .from('pings')
    .where({ id: userID}, 'timestamp', '>=', 'current_timestamp() - INTERVAL 1 DAY')
    console.log(pingRequest);
    let insertData = { id: userID, shares: pingRequest.length }
    pingList.push(insertData);
    if (pingList.length === users.length) {
        storeShares(pingList);
        console.log('** wrote share counts to database');
    }
}

async function storeShares(pingList) {
    pingList.forEach(async function(element) {
        await db('shares')
        .where({ id: element.id })
        .update({ shares: element.shares })
    });
}


async function compareHash(nodeArray, checkHeight) {
    let requestArray = nodeArray.map(item => `http://${item}/json_rpc`);
    return Promise.all(requestArray.map(url => 
        getBlockHash(url, checkHeight) 
        .catch(error => console.log('** failed health check\n' + error))
    ))
}

function validateNodes(nodeArray) {
    // take the array of nodes and create an array of promises
    let requestArray = nodeArray.map(item => `http://${item}/fee`);
    return Promise.all(requestArray.map(url => 
        asyncGetData(url) 
        .catch(error => console.log('** failed health check\n' + error))
    ))
}

function getBlockHash(apiURL, height) {
    const requestOptions = { 
        method: 'POST',
        url: apiURL,
        body:
        { jsonrpc: '2.0', method: 'on_getblockhash', params: [ height ] },
        json: true,
        timeout: 1000
    };
    try {
        const result = request(requestOptions);
        return result;
    } catch (err) {
        return undefined;
    }
}

async function getData(apiURL) {
    const requestOptions = {
        method: 'GET',
        uri: apiURL,
        headers: {},
        json: true,
        gzip: true,
        timeout: 1000
    };
    try {
        const result = await request(requestOptions);
        return result;
    } catch (err) {
        return undefined;
    }
}

function asyncGetData(apiURL) {
    const requestOptions = {
        method: 'GET',
        uri: apiURL,
        headers: {},
        json: true,
        gzip: true,
        timeout: 1000
    };
    try {
        const result = request(requestOptions);
        return result;
    } catch (err) {
        return undefined;
    }
}

function getRandomNumber(max) {
    return Math.floor(Math.random() * (max + 1));
  }