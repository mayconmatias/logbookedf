#!/usr/bin/env node

const fs = require('fs');
const https = require('https');

// Configuração Supabase
const SUPABASE_URL = 'https://ojkfzowzuyyxgmmljbsc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qa2Z6b3d6dXl5eGdtbWxqYnNjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyOTAyNjI1NywiZXhwIjoyMDQ0NjAyMjU3fQ.qJ5sH6YKo8yGVK7Hca8yMcOqPg0N9tgEKkYVhxQEOgs';

// Ler arquivo de migration
const migrationSQL = fs.readFileSync('./supabase/migrations/20260213_add_plan_expires_at.sql', 'utf8');

// Executar via Supabase REST API
const postData = JSON.stringify({ query: migrationSQL });

const options = {
  hostname: 'ojkfzowzuyyxgmmljbsc.supabase.co',
  port: 443,
  path: '/rest/v1/rpc/exec_sql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('🚀 Executando migration...\n');

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('✅ Migration executada com sucesso!');
      console.log('\nResultado:', data);
    } else {
      console.error('❌ Erro ao executar migration');
      console.error('Status:', res.statusCode);
      console.error('Resposta:', data);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Erro na requisição:', error);
  process.exit(1);
});

req.write(postData);
req.end();
