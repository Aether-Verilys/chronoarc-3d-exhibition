"""Submit or resume the Tripo P2 lamp asset without creating duplicate tasks."""
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'public/models/claw-machine'
RECORD = DESTINATION / 'neon-light-generation.json'
PROMPT = (
    'One premium slim upright industrial arcade LED light column with one long '
    'frosted white opal diffuser, dark graphite anodized aluminum housing, '
    'slender protective side rails, rounded machined metal end caps, small screws '
    'and subtle vent slots, compact weighted mounting foot. Height twelve times '
    'its width. Refined retro-futuristic design for a red arcade claw machine. '
    'Neutral milky white luminous surface clearly separated from the dark metal '
    'body. Single isolated complete object, realistic PBR materials, efficient '
    'game mesh, no room, no surrounding glow, no text, no other objects. Upright Y.'
)


def tripo(*arguments):
    result = subprocess.run(['tripo', *arguments, '--json', '--no-open'],
                            capture_output=True, text=True, timeout=120, check=True)
    return json.loads(result.stdout)


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    if RECORD.exists():
        record = json.loads(RECORD.read_text())
    else:
        task = tripo('make', PROMPT, '--model', 'tripo-p2',
                     '--param', 'face_limit=6000', '--param', 'texture=true',
                     '--param', 'pbr=true', '--no-wait', '--no-download', '--yes')
        record = {'task_id': task['task_id'], 'model': 'P2-20260801',
                  'prompt': PROMPT, 'face_limit': 6000}
        RECORD.write_text(json.dumps(record, indent=2) + '\n')
    task = tripo('task', 'get', record['task_id'])
    print(json.dumps({'task_id': record['task_id'], 'status': task['status'],
                      'progress': task.get('progress')}), flush=True)
    if task['status'] == 'success':
        subprocess.run(['curl', '-fsSL', '--retry', '3', '--max-time', '120',
                        task['output']['model_url'], '-o', str(DESTINATION / 'neon-light.glb')], check=True)
        record['status'] = 'success'
        RECORD.write_text(json.dumps(record, indent=2) + '\n')
    elif task['status'] in ('failed', 'cancelled', 'banned', 'expired'):
        raise RuntimeError(f"Tripo generation ended with status {task['status']}")


if __name__ == '__main__':
    main()
