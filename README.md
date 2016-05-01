# rm-s3-put-dir

Function and command line utility for RISD Media to put directories on S3.

As a function:

```JavaScript
var rmS3PutDir = require('rm-s3-put-dir');

var pusher = rmS3PutDir({
	aws: {
		key: String,
		secret: String
	},
	directory: String,
	bucket: String,
	keyPrefix: String,   // optional
	verbose: Boolean     // optional
});

pusher.on('data', function (fileUploadDetails) {
	// fileUploadDetails provided by `s3-upload-stream`
	console.log(fileUploadDetails);
});

pusher.on('end', function () {
	
});
```

As command line utility:

```
rm-s3-put-dir directory
    --bucket
    --aws
    --branchSuffix
    --keyPrefix

`directory`   The path to the file to upload.
              Required.

`bucket`      The name of the bucket to put files into.
              Required.

`aws`         Path to JSON file with AWS credentials.
              Default is `~/.risdmedia/aws.json`.
              Expects two keys: `key` & `secret`.
              Required.

`gitSuffix`   Boolean flag. If included, the bucket
              name will be suffixed with `-` & the
              name of the current branch.

`isWebsite`   Boolean flag. If included, the bucket
              will be configured as a static website.

`keyPrefix`   Prefix for each file uploaded to
              the bucket.
              Optional. Defaults to an empty string.

Example

./bin/cmd public --bucket=risdmedia-assets

Using `--gitSuffix` from a branch named `develop`,
would produce publishing to a bucket named
`risdmedia-assets-develop`.

./bin/cmd public --bucket=risdmedia-assets --gitSuffix
```
