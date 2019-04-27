// Copyright (c) 2019 ExtraHash, The LightChain Developers
//
// Please see included LICENSE file for more information.

'use strict';

const knex = (module.exports = require('knex')({
  client: 'mysql',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    charset: 'utf8',
  },
  pool: {
    min: 2,
    max: 10,
  },
}));
module.exports = knex;