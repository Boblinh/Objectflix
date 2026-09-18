$api = 'https://objectflix-api.boblinh.workers.dev'

$shows = (Invoke-RestMethod -Uri "$api/api/shows").shows
$totalWith = 0

foreach ($show in $shows) {
    $seasons = (Invoke-RestMethod -Uri "$api/api/shows/$($show.id)/seasons").seasons
    $with = @()
    $total = 0
    foreach ($season in $seasons) {
        $eps = (Invoke-RestMethod -Uri "$api/api/seasons/$($season.id)/episodes").episodes
        foreach ($ep in $eps) {
            $total++
            $subs = (Invoke-RestMethod -Uri "$api/api/episodes/$($ep.id)/subtitles").subtitles
            $obj = [PSCustomObject]@{ Title = $ep.title; Langs = ($subs | ForEach-Object { $_.language }) -join ',' }
            if ($subs.Count -gt 0) { $with += $obj; $totalWith++ }
        }
    }
    Write-Host "=== $($show.title) ===  with subs: $($with.Count) / $total"
    foreach ($ep in $with) {
        Write-Host "  [$($ep.Langs)] $($ep.Title)"
    }
    Write-Host ""
}

Write-Host "GRAND TOTAL WITH SUBTITLES: $totalWith"