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
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'synthetic.dxf'
    path.write_text(content, encoding='ascii')
    doc = ezdxf.readfile(path)
    entities = list(doc.modelspace())
    audit = doc.audit()
    assert not audit.errors, [(e.code, e.message) for e in audit.errors]
    assert not audit.fixes, [(e.code, e.message) for e in audit.fixes]
    assert len(entities) == 8, len(entities)
    assert {e.dxftype() for e in entities} == {'LINE','LWPOLYLINE','TEXT','CIRCLE','HATCH'}
    assert doc.units == 2
    assert len(doc.modelspace().query('HATCH')) == 2
    assert {e.dxf.linetype for e in entities} >= {'DASHED','HIDDEN'}
    poly = doc.modelspace().query('LWPOLYLINE').first
    assert list(poly.get_points('xy')) == [(0.5,49.5),(2.5,46.0),(6.0,45.0)]
    print(f'ezdxf {ezdxf.__version__}: {len(entities)} entities; zero audit errors; zero audit repairs')
