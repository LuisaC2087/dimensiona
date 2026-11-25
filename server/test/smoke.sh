#!/usr/bin/env bash
# Prueba de humo de la API contra un servidor en marcha. Uso: bash test/smoke.sh [http://localhost:4000]
set -e
B=${1:-http://localhost:4000}/api
j() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }
login() { curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" | j 'r.token'; }
T=$(login tienda@demo.app demo1234); TM=$(login mensajero@demo.app demo1234); TA=$(login admin@dimensiona.app ${ADMIN_PASSWORD:-admin1234})
H="Authorization: Bearer"
echo "== tienda stats"; curl -s $B/stats -H "$H $T"; echo
P=$(curl -s $B/products -H "$H $T" | j 'r.find(p=>p.name.startsWith("Vela")).id')
echo "== cotización 2 velas a Cali con contra entrega"
curl -s -X POST $B/quotes -H "$H $T" -H 'Content-Type: application/json' -d "{\"items\":[{\"productId\":\"$P\",\"qty\":2}],\"destCity\":\"Cali\",\"codAmount\":76000}" \
  | j 'JSON.stringify({zone:r.zone,cajas:r.packages.map(p=>p.box.name+" "+p.fillPct+"%"),medida:r.custom&&r.custom.box,quotes:r.quotes.map(q=>q.serviceName+" $"+q.total+" "+q.chargeableKg+"kg"),baseline:r.baseline})'
echo "== crear envío"
S=$(curl -s -X POST $B/shipments -H "$H $T" -H 'Content-Type: application/json' -d "{\"items\":[{\"productId\":\"$P\",\"qty\":2}],\"recipientName\":\"Prueba Uno\",\"recipientPhone\":\"3001112222\",\"address\":\"Cl 1 #2-3\",\"city\":\"Bogotá\"}")
ID=$(echo "$S" | j 'r.id'); CODE=$(echo "$S" | j 'r.code'); echo "$CODE $(echo "$S" | j 'r.status+" $"+r.price')"
echo "== mensajero toma, verifica medidas, recoge, entrega"
curl -s -X POST $B/shipments/$ID/accept -H "$H $TM"; echo
curl -s -X POST $B/shipments/$ID/verify -H "$H $TM" -H 'Content-Type: application/json' -d '{"length":30,"width":20,"height":15}'; echo
for st in recogido en_ruta; do curl -s -X POST $B/shipments/$ID/status -H "$H $TM" -H 'Content-Type: application/json' -d "{\"status\":\"$st\"}"; done; echo
curl -s -X POST $B/shipments/$ID/status -H "$H $TM" -H 'Content-Type: application/json' -d '{"status":"entregado"}'; echo " <- debe pedir quién recibió"
curl -s -X POST $B/shipments/$ID/status -H "$H $TM" -H 'Content-Type: application/json' -d '{"status":"entregado","receiverName":"Portería"}'; echo
echo "== rastreo público"; curl -s $B/track/$CODE | j 'r.status_label+" · "+r.events.map(e=>e.status).join(" → ")'
echo "== mensajero stats"; curl -s $B/stats -H "$H $TM"; echo
echo "== admin stats"; curl -s $B/stats -H "$H $TA"; echo
echo "== permisos: tienda no puede ver admin"; curl -s $B/admin/users -H "$H $T"; echo
echo "== registro mensajero queda pendiente"; curl -s -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"m$RANDOM@x.co\",\"password\":\"12345678\",\"name\":\"Nuevo\",\"role\":\"mensajero\",\"city\":\"Cali\"}" | j 'r.pending'
