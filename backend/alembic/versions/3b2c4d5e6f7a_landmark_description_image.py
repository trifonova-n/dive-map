"""Add description and image_url to landmarks

Revision ID: 3b2c4d5e6f7a
Revises: 2a1b3c4d5e6f
Create Date: 2026-04-22 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '3b2c4d5e6f7a'
down_revision: Union[str, None] = '2a1b3c4d5e6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('landmarks', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('landmarks', sa.Column('image_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('landmarks', 'image_url')
    op.drop_column('landmarks', 'description')
