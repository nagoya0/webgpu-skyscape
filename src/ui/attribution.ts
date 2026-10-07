// Data credits on screen (ADR 0012). Temporary layout; to be redesigned with the UI, but the
// credits themselves are required whenever the data is shown.

export function showAttribution(): void {
  const element = document.createElement('div')
  element.className = 'attribution'
  element.innerHTML = [
    '地形・航空写真：<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院（地理院タイル）</a>を加工して作成',
    '建物：<a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noopener">3D都市モデル（Project PLATEAU）国土交通省</a>',
    '市区町村：<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2024.html" target="_blank" rel="noopener">国土数値情報（行政区域データ）国土交通省</a>を加工して作成'
  ].join('<br>')
  document.body.appendChild(element)
}
