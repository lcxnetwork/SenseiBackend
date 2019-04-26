require('dotenv').config()
const db = require('./utils').knex;
const request = require('request-promise');

main();

async function main() {

    const currentHeight = await getData('http://blockapi.aeonclassic.org/block/header/top');
    console.log(currentHeight.height);
    const checkHeights = getCheckHeights(currentHeight)
    console.log(checkHeights);
}

async function getBlockHash(apiURL, height) {
    const requestOptions = { 
        method: 'POST',
        url: apiURL,
        body:
        { jsonrpc: '2.0', method: 'on_getblockhash', params: [ height ] },
        json: true 
    };
    try {
        const result = await request(requestOptions);
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
        gzip: true
    };
    try {
        const result = await request(requestOptions);
        return result;
    } catch (err) {
        return undefined;
    }
}

function getRandomNumber(max) {
    return Math.floor(Math.random() * (max + 1));
  }
  
function getCheckHeights(currentHeight) {
    const checkArray = [];
    let k = 0;
    for (k = 0; k < 3; k++) {
        checkArray.push(getRandomNumber(currentHeight.height));
    }
    return checkArray;
}