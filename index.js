var debug = require('debug')('rm-s3-put-dir');

var fs = require('fs');
var through = require('through2');
var from = require('from2-array');
var pump = require('pump');

module.exports = RmS3PutDir;

function RmS3PutDir (opts, cb) {

	var aws = require('aws-sdk');

    // Ensure you have a directory to upload to
    var e;
    if (!('directory' in opts)) {
        e = [
            'RmS3PutDir requires a `directory`',
            'key in its options.'
        ];
        throw new Error(e.join('\n'));
    }

    // Ensure you have aws credentials.
    var hasAws = false;
    if ('aws' in opts) {
        if (('key'    in opts.aws) &&
            ('secret' in opts.aws)) {
            hasAws = true;
        }
    }
    if (hasAws === false) {
        e = [
            'The configuration file referenced does not',
            'contain aws credentials. Your conf file should',
            'be JSON, and have two keys. `key` & `secret`.',
            '`key` is your public aws key, `secret` is',
            'secret key.',
            ''
        ];
        throw new Error(e.join('\n'));
    }

    if (!('bucket' in opts)) {
        e = [
            'RmS3PutDir requires a `bucket`',
            'key in its options.'
        ];
        throw new Error(e.join('\n'));
    }

    opts.aws.region = 'us-east-1';
	aws.config.update({ accessKeyId: opts.aws.key,
                    	secretAccessKey: opts.aws.secret,
                        region: opts.aws.region });

	var awsS3 = new aws.S3();

    var source = from.obj([{
            directory: opts.directory,
            bucket:    opts.bucket,
            isWebsite: opts.isWebsite,
            gitSuffix: opts.gitSuffix,
            aws:       opts.aws,
            origins:   opts.origins,
        }]);

    var pipeline = [source];

    if (opts.gitSuffix)
        pipeline = pipeline
            .concat([GitSuffix()]);

    pipeline = pipeline
        .concat([
            CreateBucketWithS3(awsS3),
            SetBucketPolicyWithS3(awsS3)
        ]);

    if (opts.origins)
        pipeline = pipeline
            .concat([SetCorsPolicyWithS3(awsS3)])

    if (opts.isWebsite)
        pipeline = pipeline
            .concat([SetWebsiteConfigWithS3(awsS3)])

    pipeline = pipeline
        .concat([
            UploadFiles()
        ]);

	return pump.apply(null, pipeline, cb);
}

function GitSuffix () {
    var git = require('git-rev');
    return through.obj(appendBranch);

    function appendBranch (conf, enc, next) {
        var stream = this;
        git.branch(function (branch) {
            conf.bucket = conf.bucket + '-' +
                branch.toLowerCase().replace(/ /g, '-');

            stream.push(conf);
            next();
        });
    }
}

function CreateBucketWithS3 (s3) {
    var params = {
        ACL: 'public-read'
    };

    return through.obj(createBucket);

    function createBucket (conf, enc, next) {

		var m = [
            'Ensuring S3 bucket exists: ', conf.bucket
        ];
        debug(m.join(''));

        var self = this;
        if (conf.bucket === false) {
            var e = [
                'Creating S3 bucket requires ',
                'a name, in this case, the ',
                'current git branch.'
            ];
            throw new Error(e.join(''));
        } else {
            debug('Create bucket using params: ');
            debug(params);
            params.Bucket = conf.bucket;
            s3.createBucket(params, finish);
        }

        function finish (err, data) {
            if (err) {
                debug(err, err.stack);
                throw new Error('Error creating bucket.');
            }
            self.push(conf);
            next();
        }
    }
}

function SetBucketPolicyWithS3 (s3) {
    function params (bucketName) {
        var p = {
            "Version": "2012-10-17",
            "Statement": [{
                "Sid": "PublicReadGetObject",
                "Effect": "Allow",
                "Principal": "*",
                "Action": ["s3:GetObject"],
                "Resource": ["arn:aws:s3:::" +
                              bucketName +"/*"]
            }]
        };

        return {
            Bucket: bucketName,
            Policy: JSON.stringify(p)
        };
    }

    return through.obj(plcy);

    function plcy (conf, enc, next) {
        var self = this;

    	var m = [
            'Configuring S3 bucket policy for',
            'public read: ', conf.bucket
        ];
        debug(m.join(''));

        if (conf.bucket === false) {
            var e = [
                'Requires a bucket to have been made ',
                'before it can be configured for ',
                'static hosting.'
            ];
            throw new Error(e.join(''));
        } else {
            debug('Set bucket policy:');
            debug(params(conf.bucket));

            conf.policyConfig = params(conf.bucket);
            s3.putBucketPolicy(
                    conf.policyConfig,
                    finish);
        }

        function finish (err, data) {
            if (err) {
                conf.policyConfig = false;
                debug(err);
                debug(err.stack);
                throw new Error(err);
            }
            self.push(conf);
            next();
        }
    }
}

function SetCorsPolicyWithS3 (s3) {

    function params (origins, bucketName) {

        function corsrule (d) {
            return [{
                AllowedOrigins: origins.split(','),
                AllowedMethods: ['GET'],
                MaxAgeSeconds: 3000,
                AllowedHeaders: [
                    'Content-*',
                    'Host',
                ],
            }]
        }

        return {
            Bucket: bucketName,
            CORSConfiguration: {
                CORSRules: corsrule(origins)
            }
        };
    }

    return through.obj(setCors);

    function setCors (conf, enc, next) {

        debug('Setting CORS policy:');
        debug(params(conf.origins, conf.bucket));

        conf.corsPolicy = params(conf.origins, conf.bucket);
        s3.putBucketCors(conf.corsPolicy, finish);

        function finish (err, data) {
            if (err) {
                conf.corsPolicy = false;
                debug(err);
                debug(err.stack);
                throw new Error(err);
            }
            self.push(conf);
            next();   
        }
    }
}

function SetWebsiteConfigWithS3 (s3) {
    var params = {
        WebsiteConfiguration: {
            IndexDocument: { Suffix: 'index.html' },
            ErrorDocument: { Key: '404.html' }
        }
    };
    function url (bucketName) {
        return [
            'http://',
            bucketName,
            '.s3-website-us-east-1.amazonaws.com'
        ].join('');
    }

    return through.obj(websiteConfig);

    function websiteConfig (conf, enc, next) {
        var self = this;

        var m = [
            'Configuring S3 bucket for static hosting: ', conf.bucket
        ];
        debug(m.join(''));

        if (conf.bucket === false) {
            var e = [
                'Requires a bucket to have been made ',
                'before it can be configured for ',
                'static hosting.'
            ];
            throw new Error(e.join(''));
        } else {
            params.Bucket = conf.bucket;
            s3.putBucketWebsite(params, finish);
        }

        function finish (err, data) {
            if (err) {
                debug(err);
                debug(err.stack);
                throw new Error(err);
            } else {
                conf.websiteConfig = params;
                conf.url = url(conf.bucket);
                console.log(conf.url);
            }
            self.push(conf);
            next();
        }
    }
}

function UploadFiles () {
	var s3sync = require('s3-sync');
    var readdirp = require('readdirp');
	var mime = require('mime');

	return through.obj(uploads);

	function uploads (conf, enc, next) {
		var stream = this;

		var m = [
			'Uploading to s3 bucket ', conf.bucket
		];
		debug(m.join(' '));

        var files = readdirp({
            root: conf.directory,
            directoryFilter: ['!.git', '!cache']
        })
        .on('error', function (err) {
            console.log(err.message);
        });

        var prefixer = through.obj(
            function (row, enc, next) {
                debug(row);
                if (conf.directory !== '.') {
                    row.path = [conf.directory, row.name].join('/');
                }
                this.push(row);
                next();
            });

        var uploader = s3sync({
            key: conf.aws.key,
            secret: conf.aws.secret,
            bucket: conf.bucket,
            concurrency: 16
        })
        .on('data', function (file) {
            debug(file.url);
        })
        .on('error', debug)
        .on('end', function () {
            debug('Done uploading.');
            next();
        });

        files.pipe(prefixer).pipe(uploader);
	}
}
