"""Atalho para rodar `python -m robo.fila` a partir da raiz do repositório (é o que o comando /buscar-linkedin-indeed usa):

    python robo-vagas/fila.py registrar --plataforma "LinkedIn vagas" --empresa X --cargo Y --link URL --cidade Campinas
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from robo.fila import main  # noqa: E402

if __name__ == "__main__":
    main()
