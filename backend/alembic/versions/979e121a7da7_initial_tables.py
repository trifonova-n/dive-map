"""Initial tables

Revision ID: 979e121a7da7
Revises:
Create Date: 2026-04-18 23:23:38.015586

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '979e121a7da7'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OUR_TABLES = {"users", "dive_sites", "dive_plans", "waypoints"}


def upgrade() -> None:
    op.create_table('dive_sites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('mag_declination', sa.Float(), nullable=False),
        sa.Column('crs_proj4', sa.String(length=500), nullable=False),
        sa.Column('z_scale', sa.Float(), nullable=False),
        sa.Column('base_extent', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('dive_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('site_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['site_id'], ['dive_sites.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('waypoints',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False),
        sa.Column('seq', sa.Integer(), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('depth_m', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['plan_id'], ['dive_plans.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Seed Point Lobos dive site
    op.execute("""
        INSERT INTO dive_sites (name, latitude, longitude, mag_declination, crs_proj4, z_scale, base_extent)
        VALUES (
            'Point Lobos',
            36.55, -121.94,
            -12.0,
            '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs',
            2.0,
            '{"cx": 594796.86, "cy": 4042565.21, "width": 1519.99, "height": 1519.99, "rotation": 90.0}'::jsonb
        )
    """)


def downgrade() -> None:
    op.drop_table('waypoints')
    op.drop_table('dive_plans')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_table('dive_sites')
