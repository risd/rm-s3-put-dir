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

```
rm-s3-put-dir directory
    --bucket
    --aws
    --keyPrefix

`directory`   The path to the file to upload.
              Required.

`bucket`      The name of the bucket to put files into.
              Required.

`aws`         Path to JSON file with AWS credentials.
              Default is `~/.risdmedia/aws.json`.
              Expects two keys: `key` & `secret`.
              Required.

`keyPrefix`   Prefix for each file uploaded to
              the bucket.

Example

./bin/cmd public --bucket=risdmedia-assets
```