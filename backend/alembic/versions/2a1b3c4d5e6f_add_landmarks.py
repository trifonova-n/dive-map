"""Add landmarks

Revision ID: 2a1b3c4d5e6f
Revises: 979e121a7da7
Create Date: 2026-04-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '2a1b3c4d5e6f'
down_revision: Union[str, None] = '979e121a7da7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('landmarks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('site_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('depth_m', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['site_id'], ['dive_sites.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_landmarks_site_id'), 'landmarks', ['site_id'])

    # Seed curated Point Lobos landmarks. user_id NULL = global.
    # depth_m NULL = surface feature. Coordinates are approximate and can be refined later.
    op.execute("""
        INSERT INTO landmarks (site_id, user_id, name, latitude, longitude, depth_m) VALUES
            (1, NULL, 'Whaler''s Cove',    36.52150, -121.93950, NULL),
            (1, NULL, 'Bluefish Cove',     36.52500, -121.94100, NULL),
            (1, NULL, 'Granite Point',     36.52700, -121.94250, NULL),
            (1, NULL, 'Sea Lion Point',    36.51850, -121.95100, NULL),
            (1, NULL, 'Hidden Beach',      36.52280, -121.94580, NULL),
            (1, NULL, 'Hole-in-the-Wall',  36.51950, -121.94650, NULL)
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_landmarks_site_id'), table_name='landmarks')
    op.drop_table('landmarks')
