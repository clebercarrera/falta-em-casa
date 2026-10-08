# Falta em Casa

Aplicação web mobile-first para a família anotar o que está faltando em casa e compartilhar uma lista de compras em tempo real.

## O que já vem pronto

- Cadastro e login por e-mail e senha com Firebase Authentication.
- Criação de uma lista da família e entrada por código de convite de 8 caracteres.
- Lista sincronizada em tempo real entre as pessoas da mesma família.
- Inclusão rápida com quantidade e categoria, filtros, busca e itens já comprados.
- Interface responsiva e instalável como PWA em navegadores compatíveis.
- Regras do Cloud Firestore em `firestore.rules` e workflow de publicação no GitHub Pages.

Cada conta tem uma lista familiar ativa por vez. Para compartilhar, cada pessoa cria uma conta e usa o código enviado pela família. Se a conta já estiver em outra lista, abra **Família** e escolha **Tenho um código de outra família**. A conta sai da lista anterior, mas os itens permanecem para as outras pessoas.

## 1. Preparar o Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
2. Em **Authentication → Sign-in method**, ative **E-mail/senha**.
3. Em **Firestore Database**, crie o banco Cloud Firestore.
4. Em **Configurações do projeto → Seus apps**, registre um app Web e copie a configuração.
5. O arquivo `firebase-config.js` já está preenchido com os dados do app Web fornecidos; confirme que correspondem ao projeto esperado.
6. No Firestore, abra **Regras** e publique o conteúdo de `firestore.rules`. Não use regras abertas de teste em produção.
7. Em **Authentication → Settings → Authorized domains**, adicione o domínio do GitHub Pages (por exemplo, `seu-usuario.github.io`). `localhost` serve para teste local.

A configuração Web do Firebase, inclusive `apiKey`, é enviada ao navegador e **não é uma senha**. A privacidade dos dados depende do login e das regras restritivas de Firestore incluídas no projeto. Não substitua as regras por acesso público.

## 2. Rodar localmente

É necessário Node.js 18 ou mais recente. Depois de preencher `firebase-config.js`:

```sh
npm start
```

Abra `http://localhost:4173`. O app requer conexão à internet para autenticar e sincronizar a lista com Firebase.

## 3. Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie os arquivos desta pasta para a branch `main`.
2. No repositório, abra **Settings → Pages** e selecione **GitHub Actions** como fonte de publicação.
3. O workflow `.github/workflows/deploy.yml` publica o site a cada atualização da branch `main` (ou manualmente em **Actions → Deploy to GitHub Pages → Run workflow**).
4. Aguarde o workflow concluir e abra a URL indicada pelo GitHub em **Settings → Pages**.
5. Confirme que o domínio está cadastrado em **Authorized domains** no Firebase Authentication.

Se houver domínio personalizado, cadastre também esse domínio no Firebase Authentication.

## Estrutura

- `index.html`, `styles.css`, `app.js`: interface e comportamento do app.
- `firebase-config.js`: configuração pública do app Web Firebase.
- `firestore.rules`: acesso por conta e associação à família.
- `manifest.webmanifest`, `service-worker.js`, `icons/`: suporte à instalação PWA e cache da interface.
- `.github/workflows/deploy.yml`: publicação estática no GitHub Pages.
- `server.mjs`: servidor local sem dependências adicionais.
