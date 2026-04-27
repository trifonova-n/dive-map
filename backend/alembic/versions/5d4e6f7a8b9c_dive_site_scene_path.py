"""Add scene_path to dive_sites

Revision ID: 5d4e6f7a8b9c
Revises: 4c3d5e6f7a8b
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '5d4e6f7a8b9c'
down_revision: Union[str, None] = '4c3d5e6f7a8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add as NOT NULL with server_default so existing rows backfill, then drop
    # the default so future inserts must specify a path explicitly.
    # Add as NOT NULL with a placeholder server_default so existing rows
    # backfill, then drop the default so future inserts must specify a path.
    # The placeholder is immediately overwritten with the real per-site path
    # for the seeded Point Lobos row.
    op.add_column(
        'dive_sites',
        sa.Column(
            'scene_path',
            sa.String(length=500),
            nullable=False,
            server_default='',
        ),
    )
    op.execute("""
        UPDATE dive_sites
        SET scene_path = '/data/sites/point-lobos/scene.js'
        WHERE name = 'Point Lobos'
    """)
    op.alter_column('dive_sites', 'scene_path', server_default=None)


def downgrade() -> None:
    op.drop_column('dive_sites', 'scene_path')
