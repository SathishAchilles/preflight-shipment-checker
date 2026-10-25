import base64
s=open('shell.html').read()
b64=base64.b64encode(open('../assets/Preflight_Test_Cases.xlsx','rb').read()).decode()
for k,f in [('ENGINE','engine.js'),('CHAT','chat.js'),('TESTS','tests.js'),('APP','app.js')]:
    code=open(f).read()
    assert '</script' not in code.lower()
    s=s.replace('{{'+k+'}}',code)
s=s.replace('{{SAMPLE}}',b64)
open('preflight.html','w').write(s)
print(len(s))
