# size-label-action-with-proxy-support

GitHub action to assign labels based on pull request change sizes.

Labels are taken from https://github.com/kubernetes/kubernetes/labels?q=size

Based on pascalgn/size-label-action and updates from @donovanmuller's pull request: https://github.com/pascalgn/size-label-action/pull/28 to add proxy support.

## Usage

Create a `.github/workflows/size-label.yml` file:

```yaml
name: size-label-action-with-proxy-support
on: pull_request
jobs:
  size-label-action-with-proxy-support:
    runs-on: ubuntu-latest
    steps:
      - name: size-label-action-with-proxy-support
        uses: "casr-anz/size-label-action-with-proxy-support@v0.0.2"
        env:
          GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
```

## Create the needed labels

Export both `GITHUB_TOKEN` and `REPO` (e.g. `my-username/my-repository`) and run the script below:

```bash
for size in XL XXL XS S M L; do
  curl -sf -H "Authorization: Bearer $GITHUB_TOKEN" "https://api.github.com/repos/kubernetes/kubernetes/labels/size/$size" |
    jq '. | { "name": .name, "color": .color, "description": .description }' |
    curl -sfXPOST -d @- -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/repos/$REPO/labels
done
```

## Configuration

The following environment variables are supported:

- `IGNORED`: A list of [glob expressions](http://man7.org/linux/man-pages/man7/glob.7.html)
  separated by newlines. Files matching these expressions will not count when
  calculating the change size of the pull request. Lines starting with `#` are
  ignored and files matching lines starting with `!` are always included.

You can configure the environment variables in the workflow file like this:

```yaml
        env:
          GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
          IGNORED: ".*\n!.gitignore\nyarn.lock\ngenerated/**"
```

## Custom sizes

The default sizes are:

```js
{
  "0": "XS",
  "10": "S",
  "30": "M",
  "100": "L",
  "500": "XL",
  "1000": "XXL"
}
```

You can pass your own configuration by passing `sizes`

```yaml
name: size-label-action-with-proxy-support
on: pull_request
jobs:
  size-label-action-with-proxy-support:
    runs-on: ubuntu-latest
    steps:
      - name: size-label-action-with-proxy-support
        uses: "casr-anz/size-label-action-with-proxy-support-action@v0.0.2"
        env:
          GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
        with:
          sizes: >
            {
              "0": "XS",
              "20": "S",
              "50": "M",
              "200": "L",
              "800": "XL",
              "2000": "XXL"
            }
```

## License

[MIT](LICENSE)
