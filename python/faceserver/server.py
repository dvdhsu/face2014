import datetime
import pytz
import random
import json
import copy
import uuid
import urllib
import base64
import sha
import hmac
import hashlib
import base64
import json

import tornado.ioloop
import tornado.web
import boto

s3 = boto.connect_s3()

IMG_BUCKET_NAME = 'face2014.nc'
IMG_DIR = 'img/test03/'

NROWS = 7
NCOLUMNS = 7

class ImageShuffler():

    def __init__(self, images):

        self.images = images
        random.shuffle(self.images)
        self.current = 0

    def next(self):
        self.current += 1
        if self.current >= len(self.images):
            self.current = 0

        return self.images[self.current]


class PickImageHandler(tornado.web.RequestHandler):

    def initialize(self, shuffler=None):
        self.shuffler = shuffler

    def get(self):
        data = {}

        data['image'] = self.shuffler.next()
        data['row'] = int(random.random() * NROWS)
        data['column'] = int(random.random() * NCOLUMNS)

        self.write(json.dumps(data))
        self.finish()


class SignUpload(tornado.web.RequestHandler):

    def get(self):

        expiration = datetime.datetime.now(pytz.utc) + datetime.timedelta(hours=1)

        policy = {
            'expiration': expiration.isoformat(),
            'conditions':
                [
                    {'bucket': 'face2014.nc'},
                    ['starts-with', '$key', ''],
                    {'acl': 'public-read'},
                    ['starts-with', '$Content-type', ''],
                    ['content-length-range', 0, 10 * 1024 * 1024]
                ]
            }

        print json.dumps(policy, indent=4)
        policy_encoded = base64.b64encode(json.dumps(policy)).replace('\n', '')

        signature = base64.b64encode(
            hmac.new(boto.config.get('Credentials', 'aws_secret_access_key'),
                     policy_encoded, sha).digest()).replace('\n', '')

        key = boto.config.get('Credentials', 'aws_access_key_id')

        self.write(json.dumps({
            'key': key,
            'signature': signature,
            'policy': policy_encoded}))
        self.finish()


class PickImagesHandler(tornado.web.RequestHandler):

    def initialize(self, shuffler=None):
        self.shuffler = shuffler

    def get(self):
        data = {}
        rows = []

        n = 0
        for i in range(0, NROWS):
            current_row = {}
            rows.append(current_row)

            images = []
            current_row['images'] = images

            for j in range(0, NCOLUMNS):
                images.append(
                        {'url': self.shuffler.next(),
                         'id': 'image-' + str(n)})
                n += 1

        data['rows'] = rows
        self.write(json.dumps(data))
        self.finish()


class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.write("Face 2014!")
        self.finish()


def discover_images():

    image_urls = []

    s3_conn = boto.connect_s3()
    s3_bucket = s3_conn.get_bucket(IMG_BUCKET_NAME)

    for result in list(s3_bucket.list(prefix=IMG_DIR)):
        image_url = (result.generate_url(
            1000, force_http=True, query_auth=False))
        if not image_url.endswith('.jpg'):
            continue
        image_urls.append(image_url)

    random.shuffle(image_urls)

    return image_urls


def main():

    print 'discovering images...'
    images = discover_images()

    shuffler = ImageShuffler(images)

    application = tornado.web.Application(
        [("/", MainHandler),
         ("/html/(.*)", tornado.web.StaticFileHandler, 
                {"path": "./html"}),
         ("/api/v1/pickimage", PickImageHandler,
                {"shuffler": shuffler}),
         ("/api/v1/pickimages", PickImagesHandler,
                {"shuffler": shuffler}),
         ("/api/v1/signupload", SignUpload)])

    print 'serving face2014...'

    application.listen(8888)
    tornado.ioloop.IOLoop.instance().start()
