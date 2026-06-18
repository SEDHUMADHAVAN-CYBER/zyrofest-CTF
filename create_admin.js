require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const email = 'madhavansedhu598@gmail.com';
  const password = 'Sedhu@678';
  
  console.log(`Setting up admin: ${email}`);
  
  // 1. Hash password
  const hash = await bcrypt.hash(password, 10);
  
  // 2. Insert or update user
  const { data: existing } = await supabase.from('users').select('id').eq('username', email).single();
  if (existing) {
    console.log('User exists, updating password...');
    await supabase.from('users').update({ password_hash: hash }).eq('username', email);
  } else {
    console.log('Inserting new user...');
    await supabase.from('users').insert([{ username: email, password_hash: hash }]);
  }
  
  // 3. Update settings for admin
  const { data: setting } = await supabase.from('settings').select('key').eq('key', 'admin_username').single();
  if (setting) {
    console.log('Updating admin_username setting...');
    await supabase.from('settings').update({ value: email }).eq('key', 'admin_username');
  } else {
    console.log('Inserting admin_username setting...');
    await supabase.from('settings').insert([{ key: 'admin_username', value: email }]);
  }
  
  console.log('Admin user successfully configured!');
}

main().catch(console.error);
