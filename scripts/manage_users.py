#!/usr/bin/env python3
"""
Script para gerenciamento manual de usuários do sistema B3 Rebalanceamento.
Uso:
    python scripts/manage_users.py --add <usuario> <senha>
    python scripts/manage_users.py --list
    python scripts/manage_users.py --delete <usuario>
"""

import sqlite3
import os
import sys
import argparse
from werkzeug.security import generate_password_hash

# Caminho para o banco de dados (relativo à raiz do projeto)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "app.db")

def get_connection():
    return sqlite3.connect(DB_PATH)

def add_user(username, password):
    conn = get_connection()
    password_hash = generate_password_hash(password)
    try:
        conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, password_hash))
        conn.commit()
        print(f"Usuário '{username}' adicionado com sucesso.")
    except sqlite3.IntegrityError:
        print(f"Erro: Usuário '{username}' já existe.")
    finally:
        conn.close()

def list_users():
    conn = get_connection()
    users = conn.execute("SELECT username FROM users").fetchall()
    conn.close()
    if not users:
        print("Nenhum usuário cadastrado.")
    else:
        print("Usuários cadastrados:")
        for user in users:
            print(f"- {user[0]}")

def delete_user(username):
    conn = get_connection()
    cursor = conn.execute("DELETE FROM users WHERE username = ?", (username,))
    conn.commit()
    if cursor.rowcount > 0:
        print(f"Usuário '{username}' excluído.")
    else:
        print(f"Usuário '{username}' não encontrado.")
    conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gerenciador de usuários B3 Rebalanceamento")
    parser.add_argument("--add", nargs=2, metavar=("USUARIO", "SENHA"), help="Adiciona um novo usuário")
    parser.add_argument("--list", action="store_true", help="Lista todos os usuários")
    parser.add_argument("--delete", metavar="USUARIO", help="Exclui um usuário")

    args = parser.parse_args()

    if not os.path.exists(DB_PATH):
        print(f"Erro: Banco de dados não encontrado em {DB_PATH}. Rode o server.py primeiro.")
        sys.exit(1)

    if args.add:
        add_user(args.add[0], args.add[1])
    elif args.list:
        list_users()
    elif args.delete:
        delete_user(args.delete)
    else:
        parser.print_help()
