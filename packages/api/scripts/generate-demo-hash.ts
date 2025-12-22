/**
 * Generate bcrypt hash for staging demo user password
 * Run this to get the hash to use in seed-staging.sql
 *
 * NOTE: Do not use real production passwords with this script.
 *       This is strictly for generating known demo credentials for staging.
 */

import bcrypt from "bcrypt";

const password = "Demo123!Pass";
const saltRounds = 12;

bcrypt.hash(password, saltRounds).then((hash) => {
  console.log("Password:", password);
  console.log("Hash:", hash);
  console.log("");
  console.log("Copy this hash into scripts/seed-staging.sql");
});
