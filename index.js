'use strict';

const 
	http = require('http'),
	path = require('path'),
	urlModule = require('url'),
	fs = require('fs'),
	crypto = require('crypto'),
	formidable = require('formidable');

const configuration = {
	// where should we store the actual files
	storagePath: path.join(__dirname, 'storage'),

	// web port to bind to
	webPort: 3000,

	// if you want your file sharing service to be private - you can specify the URL of the hidden upload form URL here. Otherwise set to '/'
	uploadFormPath: '/upload',

	expireFilesAfterSeconds: 86400,

	deleteKeySecret: 'jkdghskzbvgndrv'
};

function compareStrings(a,b) {
	const len = Math.max(a.length,b.length);

	const bufferA = Buffer.alloc(len);
	bufferA.write(a);

	const bufferB = Buffer.alloc(len);
	bufferB.write(b);

	return crypto.timingSafeEqual(bufferA, bufferB);
}

function randomString(len) {
	let text = "";
	const possible = "123456789";

	for (let i=0; i < len; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}

function expireFiles() {
	const now = new Date().getTime();

	const files = fs.readdirSync(configuration.storagePath);
	files.forEach(filename => {
		try {
			const fullPath = path.join(configuration.storagePath, filename);
			const stat = fs.statSync(fullPath);
			const diffSeconds = Math.floor((now - stat.ctime.getTime())/1000);
			if (diffSeconds >= configuration.expireFilesAfterSeconds) {
				try {
					fs.unlinkSync(fullPath);
				} catch(e) {
					// nothing
				}
			}
		} catch(e) {
			// FIXME maybe tell something?
		}
	});
}

const indexHtml    = fs.readFileSync(path.join(__dirname, 'html/index.html'));
const downloadHtml = fs.readFileSync(path.join(__dirname, 'html/download.html'));
const uploadHtml   = fs.readFileSync(path.join(__dirname, 'html/upload.html'));
const uploadedHtml = fs.readFileSync(path.join(__dirname, 'html/uploaded.html'));
const notFoundHtml = fs.readFileSync(path.join(__dirname, 'html/404.html'));
const deleteHtml   = fs.readFileSync(path.join(__dirname, 'html/delete.html'));
const deletedHtml  = fs.readFileSync(path.join(__dirname, 'html/deleted.html'));

function sendHtml(res, httpStatus, html) {
	res.writeHead(httpStatus, {
		'content-type': 'text/html; charset=utf-8',
		'content-length': html.length
	});
	res.end(html);
}

function sendNotFound(res) {
	sendHtml(res, 404, notFoundHtml);
}

function calculateHashFromFilename(filename) {
	return crypto.createHmac('sha256', configuration.deleteKeySecret)
		.update(filename)
		.digest('hex')
		.substr(0, 16);
}

function storeFile(sourcePath, filename) {
	const randomID = randomString(9);
	const destName = randomID + '-' + encodeURIComponent(filename);

	const destPath = path.join(configuration.storagePath, destName);
	fs.writeFileSync(destPath, fs.readFileSync(sourcePath));
	fs.unlinkSync(sourcePath);

	const deleteKey = calculateHashFromFilename(destName);

	return {
		fileKey: randomID,
		deleteKey: deleteKey
	};
}

function extractFileKeyFromURL(url) {
	const elements = url.replace(/\/$/, '').substr(1,102400).split('/');

	elements.shift(); // remove "/d/";
	if (elements.length==0) {
		return null;
	}

	const fileKey = parseInt(elements[0], 10);

	if (fileKey==0 || isNaN(fileKey) || fileKey<100000000 || fileKey>999999999999) {
		return null;
	}

	let deleteKey = null;
	if (elements.length == 2) {
		deleteKey = elements[1];
		if (!deleteKey.match(/^[0-9a-f]+$/)) {
			return null;
		}
	}

	return { fileKey, deleteKey };
}

function findFileByKey(key) {
	const _filenamePrefix = key + '-';
	const prefixLen = _filenamePrefix.length;
	const files = fs.readdirSync(configuration.storagePath).filter(name => {
		if (compareStrings(name.substr(0,prefixLen), _filenamePrefix)) {
			return true;
		}
	});

	if (files.length!=1) {
		return null;
	}

	const filename = files[0];
	const downloadFilename = filename.substr(key.toString().length+1, 100000);

	return { filename, downloadFilename };
}

/********************************************/

if (!fs.existsSync(configuration.storagePath)) {
	fs.mkdirSync(configuration.storagePath);
}

http.createServer((req, res) => {
	const urlParsed = urlModule.parse(req.url, true);

	if (urlParsed.pathname == '/upload' && req.method.toLowerCase() == 'post') {
		const form = new formidable.IncomingForm();

		form.parse(req, (err, fields, files) => {
			if (err || !files || !files.upload) {
				sendHtml(res, 200, uploadHtml);
				return;
			}

			const sourceFilepath = files.upload.path;
			const sourceFilename = files.upload.name;

			const { fileKey, deleteKey } = storeFile(sourceFilepath, sourceFilename);

			const _html = uploadedHtml.toString().replace(/%FILEKEY%/g, fileKey).replace(/%DELETEKEY%/g, deleteKey);
			sendHtml(res, 200, _html);
		});

		return;

	} else if (urlParsed.pathname == configuration.uploadFormPath) {
		sendHtml(res, 200, uploadHtml); 
		return;

	} else if (urlParsed.pathname == '/') {
		sendHtml(res, 200, indexHtml);
		return;

	} else if (urlParsed.pathname.startsWith('/d/')) {
		let result = null;

		result = extractFileKeyFromURL(urlParsed.pathname);
		if (!result) {
			sendNotFound(res);
			return;
		}

		const { fileKey, deleteKey } = result;

		result = findFileByKey(fileKey);
		if (!result) {
			sendNotFound(res);
			return;
		}

		const { filename, downloadFilename } = result;

		const fullPath = path.join(configuration.storagePath, filename);

		if (deleteKey) {
			const referenceDeleteKey = calculateHashFromFilename(filename);
			if (!compareStrings(referenceDeleteKey, deleteKey)) {
				sendNotFound(res);
				return;
			}

			if (urlParsed.query.dl) {
				fs.unlinkSync(fullPath);
				sendHtml(res, 200, deletedHtml);

			} else {
				const _html = deleteHtml.toString().replace(/%FILEKEY%/g, fileKey).replace(/%DELETEKEY%/g, deleteKey);
				sendHtml(res, 200, _html);
			}

			return;
		}

		if (urlParsed.query.dl) {
			const stat = fs.statSync(fullPath);

			res.writeHead(200, {
				'content-type': 'application/octet-stream',
				'content-disposition': 'attachment; filename*=UTF-8\'\'' + downloadFilename,
				'content-length': stat.size
			});
			res.end(fs.readFileSync(fullPath));

		} else {
			const _html = downloadHtml.toString().replace(/%KEY%/g, fileKey);
			sendHtml(res, 200, _html);
		}

		return;
	
	}

	sendNotFound(res);
}).listen(configuration.webPort);

setInterval(expireFiles, 10000);

console.log("Listening on port %d", configuration.webPort);

