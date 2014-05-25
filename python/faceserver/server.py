import os
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
import tempfile

from tornado.concurrent import run_on_executor
from concurrent.futures import ThreadPoolExecutor
import tornado.ioloop
import tornado.web
import tornado.gen
import boto
from PIL import Image
from PIL import ImageOps

s3 = boto.connect_s3()

IMG_BUCKET_NAME = 'face2014-nc-x65yu'
IMG_DIR = 'img/test01'
IMG_STAGING = 'img/staging'

NROWS = 7
NCOLUMNS = 7

class ImageShuffler():

    def __init__(self, images):

        self.images = images
        self.deal()

    def deal(self):
        self.hand = self.images[:]
        random.shuffle(self.hand)

    def next(self):
        if not self.hand:
            self.deal()

        return self.hand.pop()

    def add(self, item):
        self.hand.append(item)
        self.images.append(item)


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

        object_name = IMG_STAGING + '/' + uuid.uuid4().hex + '-' +\
                urllib.quote_plus(self.get_argument('name'))

        object_type = self.get_argument('type')

        signed_request = s3.generate_url(
            1000, 'PUT', IMG_BUCKET_NAME, key=object_name,
            headers={'Content-Type': object_type, 'x-amz-acl': 'public-read'})

        self.write(json.dumps({
            'signed_request': signed_request,
            's3_object_name': object_name}))
        self.finish()


class Thumbnailer(tornado.web.RequestHandler):
    """
    Given a url pointing to a staged image, download
    the image and create a thumbnail.

    Upload the thumbnail to the 'release' image folder.
    """

    executor = ThreadPoolExecutor(10)

    def initialize(self, shuffler=None):
        self.shuffler = shuffler

    @tornado.gen.coroutine
    def post(self):

        s3_object_name = self.get_argument('s3_object_name')
        print 'creating thumbnail for', s3_object_name
        new_url = yield self.make_thumbnail(s3_object_name)
        print new_url
        self.shuffler.add(new_url)

        self.write('done')
        self.finish()

    @run_on_executor
    def make_thumbnail(self, s3_object_name):

        handle, thumbnail_path = tempfile.mkstemp(prefix='thumbnail-')
        s3bucket = s3.get_bucket(IMG_BUCKET_NAME)
        s3key = s3bucket.get_key(s3_object_name)

        print 'downloading', s3_object_name
        s3key.get_contents_to_file(open(thumbnail_path, 'w'))

        print 'making thumbnail', thumbnail_path

        im = Image.open(thumbnail_path)
        im_thumbnail = ImageOps.fit(im, (172, 172), Image.ANTIALIAS)

        print 'saving thumbnail'
        thumbnail_path_out = thumbnail_path + '.out.jpg'
        print thumbnail_path_out
        im_thumbnail.save(thumbnail_path_out)
        print 'done'

        s3_thumbnail_object_name = IMG_DIR + '/' + os.path.basename(s3_object_name)

        print 'uploading', s3_thumbnail_object_name
        print 'making new key'
        thumbnail_key = s3bucket.new_key(s3_thumbnail_object_name)
        print 'uploading file'
        thumbnail_key.set_contents_from_file(open(thumbnail_path_out, 'rb'))
        print 'setting acl'
        thumbnail_key.set_acl('public-read')

        print 'cleaning up', thumbnail_path
        os.remove(thumbnail_path)

        return thumbnail_key.generate_url(100000, force_http=True, query_auth=False)


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

    s3_bucket = s3.get_bucket(IMG_BUCKET_NAME)

    for result in list(s3_bucket.list(prefix=IMG_DIR)):
        image_url = (result.generate_url(
            1000, force_http=True, query_auth=False))
        if not image_url.endswith('.jpg'):
            continue
        image_urls.append(image_url)

    print image_urls

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
         ("/api/v1/signupload", SignUpload),
         ('/api/v1/thumbnailer', Thumbnailer,
                {"shuffler": shuffler})])

    print 'serving face2014...'

    application.listen(8888)
    tornado.ioloop.IOLoop.instance().start()
