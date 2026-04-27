"""Seed San Carlos & McAbee dive site

Revision ID: 6e5f7a8b9cad
Revises: 5d4e6f7a8b9c
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '6e5f7a8b9cad'
down_revision: Union[str, None] = '5d4e6f7a8b9c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO dive_sites
            (name, latitude, longitude, mag_declination, crs_proj4, z_scale, base_extent, scene_path)
        VALUES (
            'San Carlos & McAbee',
            36.616552, -121.896387,
            -12.0,
            '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs',
            3.0,
            '{"cx": 598687.8214069911, "cy": 4052903.568568751, "width": 2057.4958699034005, "height": 2057.4958699034005, "rotation": -35.0}'::jsonb,
            '/data/sites/san-carlos-mcabee/scene.js'
        )
    """)


def downgrade() -> None:
    op.execute("DELETE FROM dive_sites WHERE name = 'San Carlos & McAbee'")
