import random
import json

import tornado.ioloop
import tornado.web
import boto

IMG_BUCKET_NAME = 'face2014.nc'
IMG_DIR = 'img/test01/'


class PickImageHandler(tornado.web.RequestHandler):

    def initialize(self, image_urls=None):
        self.image_urls = image_urls

    def get(self):
        data = {}
        data['image'] = random.choice(self.image_urls)
        self.write(json.dumps(data))


class PickImagesHandler(tornado.web.RequestHandler):

    def initialize(self, image_urls=None):
        self.image_urls = image_urls

    def get(self):
        data = {}
        rows = []

        n = 0
        for i in range(0, 5):
            current_row = {}
            rows.append(current_row)

            images = []
            current_row['images'] = images

            for j in range(0, 5):
                images.append(
                        {'url': random.choice(self.image_urls),
                         'id': 'image-' + str(n)})
                n += 1

        data['rows'] = rows
        self.write(json.dumps(data))


class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.write("Face 2014!")


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

    return image_urls


def main():

    print 'discovering images...'
    image_urls = discover_images()

    application = tornado.web.Application(
        [("/", MainHandler),
         ("/html/(.*)", tornado.web.StaticFileHandler, 
                {"path": "./html"}),
         ("/api/v1/pickimage", PickImageHandler,
                {"image_urls": image_urls}),
         ("/api/v1/pickimages", PickImagesHandler,
                {"image_urls": image_urls})])

    print 'serving face2014...'

    application.listen(8888)
    tornado.ioloop.IOLoop.instance().start()
