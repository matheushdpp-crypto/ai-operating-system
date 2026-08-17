# Guia de Implantação em Produção / VPS

Como implantar o AiOS em um servidor Linux (Ubuntu/Debian) usando Docker Compose.

---

## 1. Preparando o Servidor

Instale Docker e Docker Compose:
```bash
sudo apt update && sudo apt install -y curl git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

---

## 2. Clonando o Repositório

```bash
git clone https://github.com/sua-organizacao/aios.git /opt/aios
cd /opt/aios
```

---

## 3. Configurando Variáveis de Produção

```bash
cp .env.example .env
nano .env
```

Defina senhas fortes para `DATABASE_PASSWORD`, `N8N_ENCRYPTION_KEY` e `JWT_SECRET`.

---

## 4. Subindo os Serviços

```bash
chmod +x scripts/*.sh
./scripts/install.sh
```

---

## 5. Configuração de Reverse Proxy (Nginx / Caddy com SSL)

Exemplo de bloco Nginx com HTTPS (Let's Encrypt):

```nginx
server {
    server_name aios.suaempresa.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
