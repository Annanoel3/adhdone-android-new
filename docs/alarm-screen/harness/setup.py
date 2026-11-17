# Unpacks a JDK and the Android SDK pieces the app needs under /tmp/ab, and
# makes a build COPY of android/ there (never build inside /app). Run:
#   python3 docs/alarm-screen/harness/setup.py
import urllib.request, re, zipfile, tarfile, os, shutil, time
AB = '/tmp/ab'
os.makedirs(AB, exist_ok=True); os.chdir(AB)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000: return
    log('get', url)
    req = urllib.request.Request(url, headers={'User-Agent': 'curl/8'})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest + '.part', 'wb') as f: shutil.copyfileobj(r, f, 1024 * 1024)
    os.rename(dest + '.part', dest)
get('https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse', 'jdk.tgz')
if not os.path.isdir('jdk'):
    os.makedirs('jdk_x', exist_ok=True)
    with tarfile.open('jdk.tgz') as t: t.extractall('jdk_x')
    os.rename(os.path.join('jdk_x', os.listdir('jdk_x')[0]), 'jdk')
xml = urllib.request.urlopen('https://dl.google.com/android/repository/repository2-3.xml', timeout=60).read().decode()
def archive(path_attr):
    m = re.search(r'<remotePackage path="' + re.escape(path_attr) + r'">(.*?)</remotePackage>', xml, re.S)
    for a in re.findall(r'<archive>(.*?)</archive>', m.group(1), re.S):
        o = re.search(r'<host-os>(.*?)</host-os>', a)
        if o is None or o.group(1) == 'linux': return re.search(r'<url>(.*?)</url>', a).group(1)
def unzip(z, dest):
    with zipfile.ZipFile(z) as f:
        for info in f.infolist():
            out = f.extract(info, dest); mode = (info.external_attr >> 16) & 0o777
            if mode and not info.is_dir(): os.chmod(out, mode)
for path_attr, sub in (('platforms;android-36', 'platforms/android-36'), ('build-tools;35.0.0', 'build-tools/35.0.0')):
    target = os.path.join(AB, 'sdk', sub)
    if os.path.isdir(target): continue
    u = archive(path_attr); z = os.path.basename(u); get('https://dl.google.com/android/repository/' + u, z)
    tmp = os.path.join(AB, 'sdk', '_x'); shutil.rmtree(tmp, ignore_errors=True); unzip(z, tmp)
    tops = os.listdir(tmp); os.makedirs(os.path.dirname(target), exist_ok=True)
    os.rename(os.path.join(tmp, tops[0]) if len(tops) == 1 else tmp, target); shutil.rmtree(tmp, ignore_errors=True)
# the build copy, with the picture test and its two test libraries added to the COPY only
proj = os.path.join(AB, 'proj'); shutil.rmtree(proj, ignore_errors=True); os.makedirs(proj)
shutil.copytree('/app/android', os.path.join(proj, 'android'))
os.symlink('/app/node_modules', os.path.join(proj, 'node_modules'))
open(os.path.join(proj, 'android', 'local.properties'), 'w').write('sdk.dir=/tmp/ab/sdk\n')
here = '/app/docs/alarm-screen/harness/'
open(os.path.join(proj, 'android', 'app', 'build.gradle'), 'a').write(open(here + 'build-additions.gradle').read())
t = os.path.join(proj, 'android', 'app', 'src', 'test', 'java', 'co', 'median', 'android', 'odxqpdy'); os.makedirs(t, exist_ok=True)
shutil.copy(here + 'AlarmShotTest.java', t)
shutil.copy(here + 'build.sh', AB); os.chmod(os.path.join(AB, 'build.sh'), 0o755)
os.makedirs(os.path.join(AB, 'shots'), exist_ok=True)
log('SETUP DONE')
