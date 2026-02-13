const jwt = require('jsonwebtoken');
const fs = require('fs');

// --- PREENCHA SEUS DADOS AQUI ANTES DE RODAR ---
const TEAM_ID = '3NLY5GWMHN'; // Ex: K342... (Do canto superior direito do Apple Developer)
const KEY_ID = 'CL3SS5CS5Y';   // Ex: ABC1234... (Do portal onde você criou a Key)
const CLIENT_ID = 'com.mayconmatias.logbookedf.web'; // Services ID para Web (diferente do Bundle ID do app)
const KEY_FILE_PATH = './AuthKey_CL3SS5CS5Y.p8'; // Caminho para o arquivo .p8 que você baixou

// ------------------------------------------------

const generateSecret = () => {
  try {
    if (!fs.existsSync(KEY_FILE_PATH)) {
      console.error(`Erro: Arquivo de chave não encontrado em: ${KEY_FILE_PATH}`);
      console.log('Certifique-se de baixar o arquivo .p8 da Apple e colocar na pasta raiz ou atualizar o caminho.');
      return;
    }

    const privateKey = fs.readFileSync(KEY_FILE_PATH);

    const token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      expiresIn: '180d', // 6 meses (máximo permitido pela Apple)
      audience: 'https://appleid.apple.com',
      issuer: TEAM_ID,
      subject: CLIENT_ID,
      keyid: KEY_ID,
    });

    console.log('\n=== SEU APPLE CLIENT SECRET (Válido por 6 meses) ===\n');
    console.log(token);
    console.log('\n======================================================\n');
    console.log('Copie o código acima e cole no campo "Secret Key" no Supabase.');
    
  } catch (error) {
    console.error('Erro ao gerar token:', error.message);
  }
};

generateSecret();
