#!/bin/zsh
# 프로필 이미지 다운로드 스크립트

OUTDIR="/Users/ganggyunggyu/Programing/cafe-bot/profile-images"
mkdir -p "$OUTDIR"

# accountId:keyword pairs
ACCOUNTS=(
  "olgdmp9921:sunrise mountain landscape"
  "yenalk:gourmet food plating"
  "eytkgy5500:cute cat kitten"
  "uqgidh2690:running trail nature"
  "4giccokx:headphones music vinyl"
  "8i2vlbym:shooting star night sky"
  "heavyzebra240:coffee laptop lifestyle"
  "njmzdksm:dessert macaron sweet"
  "e6yb5u4k:cherry blossom spring"
  "suc4dce7:sunshine happy meadow"
  "xzjmfn3f:desk lamp reading"
  "8ua1womn:vintage clock antique"
  "0ehz3cb2:japanese tea rice"
  "umhu0m83:secret garden path"
  "br5rbg:colorful flowers bouquet"
  "beautifulelephant274:beautiful ocean sunset"
  "angrykoala270:koala cute animal"
  "tinyfish183:tropical fish colorful"
  "orangeswan630:books coffee study"
)

SUCCESS=0
FAIL=0

for entry in "${ACCOUNTS[@]}"; do
  ACCOUNT_ID="${entry%%:*}"
  QUERY="${entry#*:}"
  OUTFILE="$OUTDIR/${ACCOUNT_ID}.jpg"

  if [ -f "$OUTFILE" ]; then
    echo "SKIP: $ACCOUNT_ID - already exists"
    ((SUCCESS++))
    continue
  fi

  echo "SEARCH: $ACCOUNT_ID → '$QUERY'"

  ENCODED_QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))")

  openclaw browser navigate "https://www.pexels.com/search/${ENCODED_QUERY}/" --timeout 15000 2>/dev/null
  sleep 2

  IMG_URL=$(openclaw browser evaluate --fn '() => {
    const imgs = document.querySelectorAll("img[src*=\"images.pexels.com/photos\"]");
    return imgs.length > 0 ? imgs[0].src : "";
  }' 2>/dev/null)

  IMG_URL=$(echo "$IMG_URL" | tr -d '"')

  if [ -z "$IMG_URL" ] || [ "$IMG_URL" = "" ]; then
    echo "  FAIL: No image found"
    ((FAIL++))
    continue
  fi

  DOWNLOAD_URL=$(echo "$IMG_URL" | sed 's/\?.*/?auto=compress\&cs=tinysrgb\&w=400\&h=400\&fit=crop/')

  curl -sL -o "$OUTFILE" "$DOWNLOAD_URL"
  SIZE=$(stat -f%z "$OUTFILE" 2>/dev/null)

  if [ "$SIZE" -gt 1000 ]; then
    echo "  OK: downloaded ($SIZE bytes)"
    ((SUCCESS++))
  else
    echo "  FAIL: too small ($SIZE bytes)"
    rm -f "$OUTFILE"
    ((FAIL++))
  fi
done

echo ""
echo "=== RESULT: $SUCCESS success, $FAIL fail ==="
echo "Files:"
ls -la "$OUTDIR"/*.jpg 2>/dev/null
