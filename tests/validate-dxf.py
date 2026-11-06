"""Independent strict load and audit; no recovery reader or uploaded drawings.
Run: python -m pip install ezdxf==1.4.5 && python tests/validate-dxf.py
"""
import subprocess, tempfile
from pathlib import Path
import ezdxf
content = subprocess.check_output(['node', 'tests/dxf-fixture.mjs'], text=True)
# ezdxf accepts some out-of-order tags that Autodesk's importer rejects.
# Check the raw tag sequence BEFORE ezdxf can normalize it.
lines = content.strip().splitlines()
table_names = []
for i in range(0, len(lines), 2):
    if lines[i:i+2] == ['0', 'TABLE']:
        assert lines[i+2] == '2', 'TABLE must start with code 2, not a handle'
        table_names.append(lines[i+3])
        assert lines[i+4] == '5'
        start = i+8 if lines[i+6] == '330' else i+6
        assert lines[start:start+3] == ['100', 'AcDbSymbolTable', '70']
        assert int(lines[start+3]) >= 0
assert table_names == ['VPORT','LTYPE','LAYER','STYLE','VIEW','UCS','APPID','DIMSTYLE','BLOCK_RECORD']
# Inspect essential records in raw tags, not just ezdxf's populated document.
from ezdxf.lldxf.tags import Tags
from ezdxf.lldxf.loader import load_dxf_structure
raw = load_dxf_structure(iter(Tags.from_text(content.rstrip())))
assert {'HEADER','CLASSES','TABLES','BLOCKS','ENTITIES','OBJECTS'} <= set(raw)
required = {'LTYPE': {'BYBLOCK','BYLAYER','CONTINUOUS'}, 'LAYER': {'0'},
            'STYLE': {'STANDARD'}, 'APPID': {'ACAD'}, 'DIMSTYLE': {'STANDARD'},
            'BLOCK_RECORD': {'*MODEL_SPACE','*PAPER_SPACE'}}
for table, names in required.items():
    present = {str(tag.value).upper() for record in raw['TABLES']
               if record[0].value == table for tag in record if tag.code == 2}
    assert names <= present, (table, names - present)
# Check each serialized layer, including custom layers, before the reader can default it.
objects = {next((str(t.value) for t in record if t.code == 5), ''): record
           for record in raw['OBJECTS']}
styles = next(record for record in raw['OBJECTS']
              if record[0].value == 'ACDBDICTIONARYWDFLT'
              and any(t.code == 3 and t.value == 'Normal' for t in record))
style_handles = {str(t.value) for t in styles if t.code == 350}
for layer in (record for record in raw['TABLES'] if record[0].value == 'LAYER'):
    ref = next((str(t.value) for t in layer if t.code == 390), None)
    assert ref in style_handles, 'LAYER missing registered PlotStyleName'
    assert objects[ref][0].value == 'ACDBPLACEHOLDER'
    assert any(t.code == 370 for t in layer), 'LAYER missing lineweight'
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'synthetic.dxf'
    path.write_text(content, encoding='ascii')
    doc = ezdxf.readfile(path)
    entities = list(doc.modelspace())
    audit = doc.audit()
    assert not audit.errors, [(e.code, e.message) for e in audit.errors]
    assert not audit.fixes, [(e.code, e.message) for e in audit.fixes]
    assert len(entities) == 12, len(entities)
    assert {e.dxftype() for e in entities} == {'LINE','LWPOLYLINE','TEXT','CIRCLE','ARC','HATCH'}
    assert doc.units == 2
    assert len(doc.modelspace().query('HATCH')) == 2
    assert {e.dxf.linetype for e in entities} >= {'DASHED','HIDDEN','CENTER','PHANTOM','DASHDOT'}
    expected_patterns = {'CENTER': [10,-2,2.5,-2],
                         'PHANTOM': [10,-2,2.5,-2,2.5,-2],
                         'DASHDOT': [10,-2,0,-2]}
    for name, expected in expected_patterns.items():
        record = next(r for r in raw['TABLES'] if r[0].value == 'LTYPE'
                      and any(t.code == 2 and t.value == name for t in r))
        actual = [t.value for t in record if t.code == 49]
        assert actual == expected, (name, actual)
        assert next(t.value for t in record if t.code == 73) == len(expected)
        assert next(t.value for t in record if t.code == 40) == sum(map(abs,expected))
    import math
    simplex = doc.styles.get('SIMPLEX')
    assert simplex.dxf.font.lower() == 'simplex.shx'
    for text in doc.modelspace().query('TEXT'):
        assert text.dxf.style == 'SIMPLEX'
        assert math.isclose(text.dxf.height, .1/12, rel_tol=1e-12)
    dimension_style = doc.dimstyles.get('SIMPLEX')
    assert dimension_style.dxf.dimtxsty == 'SIMPLEX'  # ezdxf resolves the raw handle to a style name
    raw_style = next(r for r in raw['TABLES'] if r[0].value == 'DIMSTYLE'
                     and any(t.code == 2 and t.value == 'SIMPLEX' for t in r))
    assert next(t.value for t in raw_style if t.code == 340) == simplex.dxf.handle
    assert math.isclose(dimension_style.dxf.dimtxt, .1/12, rel_tol=1e-12)
    poly = doc.modelspace().query('LWPOLYLINE').first
    assert list(poly.get_points('xy')) == [(0.5,49.5),(2.5,46.0),(6.0,45.0)]
    print(f'ezdxf {ezdxf.__version__}: {len(entities)} entities; zero audit errors; zero audit repairs')
