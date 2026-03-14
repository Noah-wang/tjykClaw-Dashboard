async function check() {
  try {
     const res = await fetch('http://127.0.0.1:18789');
     console.log('fetch ok')
  } catch (e) {
     console.log('fetch err', e.message)
  }
}
check()
